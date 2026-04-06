package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	stdruntime "runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"lansync/internal/auth"
	"lansync/internal/clipboard"
	"lansync/internal/config"
	"lansync/internal/models"
)

type DesktopServer struct {
	ctx              context.Context
	sessionManager   *auth.SessionManager
	clipboardManager *clipboard.ClipboardManager
	pendingRequests  map[string]chan bool
	SharedDir        string
	mu               sync.Mutex
}

func NewDesktopServer(sm *auth.SessionManager, cm *clipboard.ClipboardManager) *DesktopServer {
	homeDir, _ := os.UserHomeDir()
	sharedFolder := filepath.Join(homeDir, "Downloads", "LanSync")
	os.MkdirAll(sharedFolder, 0755)

	return &DesktopServer{
		sessionManager:   sm,
		clipboardManager: cm,
		pendingRequests:  make(map[string]chan bool),
		SharedDir:        homeDir,
	}
}

func (s *DesktopServer) SetContext(ctx context.Context) { s.ctx = ctx }

func (s *DesktopServer) Start(port string) {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/connect", s.handleConnect)
	mux.HandleFunc("/api/identify", s.handleIdentify)
	mux.HandleFunc("/api/ping", s.authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	mux.HandleFunc("/api/files/list", s.authMiddleware(s.handleListFiles))
	mux.HandleFunc("/api/files/download", s.authMiddleware(s.handleDownload))
	mux.HandleFunc("/api/files/upload", s.authMiddleware(s.handleUpload))
	mux.HandleFunc("/api/files/mkdir", s.authMiddleware(s.handleMkdir))
	mux.HandleFunc("/api/clipboard/share", s.authMiddleware(s.handleClipboardShare))
	mux.HandleFunc("/api/disconnect", s.authMiddleware(s.handleDisconnect))

	http.ListenAndServe(":"+port, mux)
}

// ─── UTILITIES ────────────────────────────────────────────────────────────

func (s *DesktopServer) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		clientIP, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			clientIP = r.RemoteAddr
		}
		if clientIP == "::1" {
			clientIP = "127.0.0.1"
		}

		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !s.sessionManager.ValidateInbound(clientIP, token) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

// resolvePath forces all virtual requests (e.g. "/Photos") to physical locations safely
func (s *DesktopServer) resolvePath(reqPath string) (string, string, error) {
	if reqPath == "" {
		reqPath = "/"
	}
	cleanVirtual := filepath.Clean("/" + reqPath)
	absPhysical := filepath.Join(s.SharedDir, cleanVirtual)

	// Block Path Traversal (Jailbreak attempt)
	if !strings.HasPrefix(absPhysical, s.SharedDir) {
		return "", "", fmt.Errorf("path traversal denied")
	}
	return absPhysical, cleanVirtual, nil
}

// ─── HANDSHAKE ────────────────────────────────────────────────────────────

func (s *DesktopServer) handleConnect(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	var req models.ConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	clientIP, _, _ := net.SplitHostPort(r.RemoteAddr)
	if clientIP == "::1" {
		clientIP = "127.0.0.1"
	}
	req.IP = clientIP

	decisionChan := make(chan bool)
	s.mu.Lock()
	s.pendingRequests[clientIP] = decisionChan
	s.mu.Unlock()

	runtime.EventsEmit(s.ctx, "connection_requested", req)

	select {
	case accepted := <-decisionChan:
		if accepted {
			tokenForA := s.sessionManager.GenerateToken()
			s.sessionManager.RegisterSession(clientIP, tokenForA, req.TokenForB)

			go func(ip, port, token string) {
				for {
					time.Sleep(5 * time.Second)
					if s.sessionManager.GetOutboundToken(ip) == "" {
						break
					}
					pingReq, _ := http.NewRequest("GET", fmt.Sprintf("http://%s:%s/api/ping", ip, port), nil)
					pingReq.Header.Set("Authorization", "Bearer "+token)
					client := http.Client{Timeout: 3 * time.Second}
					client.Do(pingReq)
				}
			}(clientIP, req.Port, req.TokenForB)

			cfg := config.Load()
			json.NewEncoder(w).Encode(models.ConnectionResponse{
				Accepted:   true,
				TokenForA:  tokenForA,
				DeviceName: cfg.DeviceName,
			})
		} else {
			json.NewEncoder(w).Encode(models.ConnectionResponse{Accepted: false})
		}
	case <-time.After(30 * time.Second):
		json.NewEncoder(w).Encode(models.ConnectionResponse{Accepted: false})
	}

	s.mu.Lock()
	delete(s.pendingRequests, clientIP)
	s.mu.Unlock()
}

func (s *DesktopServer) handleDisconnect(w http.ResponseWriter, r *http.Request) {
	clientIP, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		clientIP = r.RemoteAddr
	}
	clientIP = strings.TrimPrefix(clientIP, "::ffff:")

	// Instantly kill the session and notify the Wails React frontend!
	s.sessionManager.RemoveSession(clientIP)
	runtime.EventsEmit(s.ctx, "connection_lost", clientIP)
	w.WriteHeader(http.StatusOK)
}

func (s *DesktopServer) ResolveConnection(ip string, accept bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ch, exists := s.pendingRequests[ip]; exists {
		ch <- accept
	}
}

func (s *DesktopServer) handleIdentify(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	hostname, _ := os.Hostname()
	json.NewEncoder(w).Encode(models.DeviceIdentity{
		DeviceName: hostname,
		OS:         stdruntime.GOOS,
		Type:       "desktop",
		Port:       "34931",
	})
}

// ─── FILE SYSTEM ROUTES ───────────────────────────────────────────────────

func (s *DesktopServer) handleListFiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	absPhysical, cleanVirtual, err := s.resolvePath(r.URL.Query().Get("path"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	entries, err := os.ReadDir(absPhysical)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	files := []models.FileInfo{}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}

		files = append(files, models.FileInfo{
			Name:    entry.Name(),
			Path:    filepath.ToSlash(filepath.Join(cleanVirtual, entry.Name())), // Return virtual path
			Size:    info.Size(),
			IsDir:   entry.IsDir(),
			ModTime: info.ModTime().Format("2006-01-02 15:04"),
		})
	}

	sort.Slice(files, func(i, j int) bool {
		if files[i].IsDir != files[j].IsDir {
			return files[i].IsDir
		}
		return strings.ToLower(files[i].Name) < strings.ToLower(files[j].Name)
	})

	parent := filepath.Dir(cleanVirtual)
	if cleanVirtual == "/" {
		parent = ""
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"path": cleanVirtual, "parent": parent, "files": files})
}

func (s *DesktopServer) handleDownload(w http.ResponseWriter, r *http.Request) {
	absPhysical, _, err := s.resolvePath(r.URL.Query().Get("path"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	info, err := os.Stat(absPhysical)
	if err != nil || info.IsDir() {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	f, _ := os.Open(absPhysical)
	defer f.Close()

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filepath.Base(absPhysical)))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeContent(w, r, filepath.Base(absPhysical), info.ModTime(), f)
}

func (s *DesktopServer) handleUpload(w http.ResponseWriter, r *http.Request) {
	absPhysical, _, err := s.resolvePath(r.URL.Query().Get("dir"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// FIX: Automatically build the sub-folder structure before saving the file!
	os.MkdirAll(absPhysical, 0755)

	r.ParseMultipartForm(10 << 20)
	file, header, err := r.FormFile("files")
	if err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	defer file.Close()

	dst, err := os.Create(filepath.Join(absPhysical, header.Filename))
	if err != nil {
		http.Error(w, "Could not save file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()
	io.Copy(dst, file)

	w.WriteHeader(http.StatusOK)
}

func (s *DesktopServer) handleMkdir(w http.ResponseWriter, r *http.Request) {
	absPhysical, _, err := s.resolvePath(r.URL.Query().Get("dir"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	folderName := r.URL.Query().Get("name")
	if folderName == "" {
		http.Error(w, "Name required", http.StatusBadRequest)
		return
	}

	os.MkdirAll(filepath.Join(absPhysical, folderName), 0755)
	w.WriteHeader(http.StatusOK)
}

func (s *DesktopServer) handleClipboardShare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	s.clipboardManager.HandleClipboardPost(w, r)
}
