package bridge

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"lansync/internal/auth"
	"lansync/internal/client"
	"lansync/internal/clipboard"
	"lansync/internal/models"
	"lansync/internal/server"

	_ "golang.org/x/mobile/bind"
)

var (
	ctx              context.Context
	cancel           context.CancelFunc
	sessionManager   *auth.SessionManager
	androidClient    *client.AndroidClient
	desktopServer    *server.DesktopServer
	clipboardManager *clipboard.ClipboardManager

	mobileDeviceName  = "Android Phone"
	currentExposedDir string
	dirMutex          sync.RWMutex

	// ── Track Custom Download Directory ──
	currentDownloadDir string
	dlMutex            sync.RWMutex

	pendingRequests = make(map[string]chan bool)
	prMutex         sync.Mutex

	cbProxy *androidBridgeProxy
)

type BridgeCallback interface {
	OnDeviceDropped(ip string)
	OnClipboardDataReceived(data []byte, contentType string)
	OnConnectionRequested(ip string, deviceName string)
}

type androidBridgeProxy struct{ cb BridgeCallback }

func (p *androidBridgeProxy) OnClipboardReceived(data []byte, contentType string) {
	p.cb.OnClipboardDataReceived(data, contentType)
}

func StartupWithCallback(cb BridgeCallback) {
	ctx, cancel = context.WithCancel(context.Background())
	cbProxy = &androidBridgeProxy{cb}

	sessionManager = auth.NewSessionManager(func(droppedIP string) {
		cb.OnDeviceDropped(droppedIP)
	})

	clipboardManager = clipboard.NewClipboardManager(ctx, sessionManager, true)
	clipboardManager.SetAndroidCallback(cbProxy)

	androidClient = client.NewAndroidClient(ctx, sessionManager)
	desktopServer = server.NewDesktopServer(sessionManager, clipboardManager)
	desktopServer.SetContext(ctx)

	go desktopServer.Start("34932")
}

func SetDeviceName(name string) { mobileDeviceName = name }

func UpdateExposedDir(dir string) {
	dirMutex.Lock()
	currentExposedDir = dir
	dirMutex.Unlock()
}

// ── Receive Custom Download Path from Kotlin ──
func UpdateDownloadDir(dir string) {
	dlMutex.Lock()
	currentDownloadDir = dir
	dlMutex.Unlock()
}

// ── Correct Singular Download Directory ──
func getExposedDir() string {
	dirMutex.RLock()
	defer dirMutex.RUnlock()
	if currentExposedDir == "ROOT" {
		return "/storage/emulated/0"
	}
	if currentExposedDir == "" {
		return "/storage/emulated/0/Download/LANSync"
	}
	return currentExposedDir
}

func ResolveConnection(ip string, accept bool) {
	prMutex.Lock()
	if ch, exists := pendingRequests[ip]; exists {
		ch <- accept
	}
	prMutex.Unlock()
}

func RequestConnection(ip string, port string) (string, error) {
	return androidClient.RequestConnection(ip, port, mobileDeviceName)
}

func DisconnectDevice(ip string) {
	token := sessionManager.GetOutboundToken(ip)
	if token != "" {
		req, _ := http.NewRequest("POST", fmt.Sprintf("http://%s:34931/api/disconnect", ip), nil)
		req.Header.Set("Authorization", "Bearer "+token)
		client := http.Client{Timeout: 2 * time.Second}
		go client.Do(req)
	}
	sessionManager.RemoveSession(ip)
}

func GetSessionToken(ip string) string { return sessionManager.GetOutboundToken(ip) }
func ShareMobileClipboard(ip string, port string, data []byte, contentType string) error {
	return clipboardManager.ShareMobileData(ip, port, data, contentType)
}
func GetRemoteFilesJson(ip string, port string, path string) (string, error) {
	result, err := androidClient.GetRemoteFiles(ip, port, path)
	if err != nil {
		return "", err
	}
	jsonBytes, err := json.Marshal(result)
	return string(jsonBytes), err
}
func MakeDirectory(ip string, port string, dir string, name string) error {
	return androidClient.MakeDirectory(ip, port, dir, name)
}

func StartMobileServer() {
	go func() {
		mux := http.NewServeMux()

		authMiddleware := func(next http.HandlerFunc) http.HandlerFunc {
			return func(w http.ResponseWriter, r *http.Request) {
				clientIP, _, err := net.SplitHostPort(r.RemoteAddr)
				if err != nil {
					clientIP = r.RemoteAddr
				}
				clientIP = strings.TrimPrefix(clientIP, "::ffff:")
				if clientIP == "::1" {
					clientIP = "127.0.0.1"
				}

				token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
				if !sessionManager.ValidateInbound(clientIP, token) {
					http.Error(w, "Unauthorized", http.StatusUnauthorized)
					return
				}
				next(w, r)
			}
		}

		mux.HandleFunc("/api/identify", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(models.DeviceIdentity{
				DeviceName: mobileDeviceName, OS: "android", Type: "mobile", Port: "34931",
			})
		})

		mux.HandleFunc("/api/connect", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			var req models.ConnectionRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				return
			}

			clientIP, _, _ := net.SplitHostPort(r.RemoteAddr)
			clientIP = strings.TrimPrefix(clientIP, "::ffff:")

			decisionChan := make(chan bool)
			prMutex.Lock()
			pendingRequests[clientIP] = decisionChan
			prMutex.Unlock()

			if cbProxy != nil && cbProxy.cb != nil {
				cbProxy.cb.OnConnectionRequested(clientIP, req.DeviceName)
			}

			select {
			case accepted := <-decisionChan:
				if accepted {
					tokenForA := sessionManager.GenerateToken()
					sessionManager.RegisterSession(clientIP, tokenForA, req.TokenForB)

					go func(ip, port, token string) {
						for {
							time.Sleep(5 * time.Second)
							if sessionManager.GetOutboundToken(ip) == "" {
								break
							}
							pingReq, _ := http.NewRequest("GET", fmt.Sprintf("http://%s:%s/api/ping", ip, port), nil)
							pingReq.Header.Set("Authorization", "Bearer "+token)
							client := http.Client{Timeout: 3 * time.Second}
							resp, err := client.Do(pingReq)

							if err != nil || resp.StatusCode != http.StatusOK {
								sessionManager.RemoveSession(ip)
								if cbProxy != nil && cbProxy.cb != nil {
									cbProxy.cb.OnDeviceDropped(ip)
								}
								break
							}
						}
					}(clientIP, req.Port, req.TokenForB)

					json.NewEncoder(w).Encode(models.ConnectionResponse{
						Accepted: true, TokenForA: tokenForA, DeviceName: mobileDeviceName,
					})
				} else {
					json.NewEncoder(w).Encode(models.ConnectionResponse{Accepted: false})
				}
			case <-time.After(30 * time.Second):
				json.NewEncoder(w).Encode(models.ConnectionResponse{Accepted: false})
			}

			prMutex.Lock()
			delete(pendingRequests, clientIP)
			prMutex.Unlock()
		})

		mux.HandleFunc("/api/ping", authMiddleware(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }))

		mux.HandleFunc("/api/disconnect", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			clientIP, _, _ := net.SplitHostPort(r.RemoteAddr)
			clientIP = strings.TrimPrefix(clientIP, "::ffff:")
			sessionManager.RemoveSession(clientIP)
			if cbProxy != nil && cbProxy.cb != nil {
				cbProxy.cb.OnDeviceDropped(clientIP)
			}
			w.WriteHeader(http.StatusOK)
		}))

		mux.HandleFunc("/api/files/list", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			requestedPath := r.URL.Query().Get("path")
			if requestedPath == "/" {
				requestedPath = ""
			}
			if strings.Contains(requestedPath, "..") {
				return
			}

			fullPath := filepath.Join(getExposedDir(), requestedPath)
			entries, err := os.ReadDir(fullPath)
			if err != nil {
				json.NewEncoder(w).Encode(map[string]interface{}{"path": requestedPath, "parent": filepath.Dir(requestedPath), "files": []models.FileInfo{}})
				return
			}

			var files []models.FileInfo
			for _, e := range entries {
				info, err := e.Info()
				if err != nil {
					continue
				}
				relPath := e.Name()
				if requestedPath != "" {
					relPath = requestedPath + "/" + e.Name()
				}
				files = append(files, models.FileInfo{Name: e.Name(), Path: relPath, Size: info.Size(), IsDir: e.IsDir(), ModTime: info.ModTime().Format("2006-01-02 15:04")})
			}
			parent := filepath.Dir(requestedPath)
			if requestedPath == "" {
				parent = ""
			}
			if files == nil {
				files = []models.FileInfo{}
			}
			json.NewEncoder(w).Encode(map[string]interface{}{"path": requestedPath, "parent": parent, "files": files})
		}))

		mux.HandleFunc("/api/files/download", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			requestedPath := r.URL.Query().Get("path")
			if strings.Contains(requestedPath, "..") {
				return
			}
			http.ServeFile(w, r, filepath.Join(getExposedDir(), requestedPath))
		}))

		// ── REAL-TIME STREAMING UPLOAD ──
		mux.HandleFunc("/api/files/upload", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			dir := r.URL.Query().Get("dir")
			if strings.Contains(dir, "..") {
				http.Error(w, "Invalid directory", http.StatusBadRequest)
				return
			}

			// Bypasses the OS Cache and reads bytes directly from the network stream
			reader, err := r.MultipartReader()
			if err != nil {
				http.Error(w, "Failed to read multipart stream", http.StatusBadRequest)
				return
			}

			destDir := filepath.Join(getExposedDir(), dir)
			os.MkdirAll(destDir, 0755)

			for {
				part, err := reader.NextPart()
				if err == io.EOF {
					break
				}
				if err != nil {
					continue
				}

				if part.FormName() == "files" {
					filename := part.FileName()
					if filename == "" {
						continue
					}

					dst, err := os.Create(filepath.Join(destDir, filename))
					if err == nil {
						io.Copy(dst, part) // Streams raw bytes straight to the hard drive
						dst.Close()
					}
				}
			}
			w.WriteHeader(http.StatusOK)
		}))

		mux.HandleFunc("/api/files/mkdir", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			dir := r.URL.Query().Get("dir")
			name := r.URL.Query().Get("name")
			if strings.Contains(dir, "..") || strings.Contains(name, "..") {
				return
			}
			os.MkdirAll(filepath.Join(getExposedDir(), dir, name), 0755)
			w.WriteHeader(http.StatusOK)
		}))

		mux.HandleFunc("/api/clipboard/share", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			clipboardManager.HandleClipboardPost(w, r)
		}))

		corsHandler := func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Access-Control-Allow-Origin", "*")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				if r.Method == "OPTIONS" {
					w.WriteHeader(http.StatusOK)
					return
				}
				next.ServeHTTP(w, r)
			})
		}

		http.ListenAndServe(":34931", corsHandler(mux))
	}()
}

func Shutdown() {
	if cancel != nil {
		cancel()
	}
}
