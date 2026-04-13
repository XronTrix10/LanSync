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
	"sort"
	"strings"
	"sync"
	"time"

	"lansync/internal/auth"
	"lansync/internal/client"
	"lansync/internal/clipboard"
	"lansync/internal/discovery"
	"lansync/internal/models"
	"lansync/internal/server"
	"lansync/internal/sys"

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

	currentDownloadDir string
	dlMutex            sync.RWMutex

	mobileLocalIP string
	ipMutex       sync.RWMutex

	pendingRequests = make(map[string]chan bool)
	prMutex         sync.Mutex

	cbProxy *androidBridgeProxy
)

var (
	transferMutex   sync.Mutex
	activeTransfers = make(map[string][]context.CancelFunc)
)

func registerTransfer(ip string, cancel context.CancelFunc) {
	transferMutex.Lock()
	activeTransfers[ip] = append(activeTransfers[ip], cancel)
	transferMutex.Unlock()
}

func cancelTransfersForIP(ip string) {
	transferMutex.Lock()
	if cancels, exists := activeTransfers[ip]; exists {
		for _, cancel := range cancels {
			cancel()
		}
		delete(activeTransfers, ip)
	}
	transferMutex.Unlock()
}

type ctxReader struct {
	r   io.Reader
	ctx context.Context
}

func (cr *ctxReader) Read(p []byte) (int, error) {
	select {
	case <-cr.ctx.Done():
		return 0, cr.ctx.Err()
	default:
		return cr.r.Read(p)
	}
}

type BridgeCallback interface {
	OnDeviceDropped(ip string)
	OnClipboardDataReceived(data []byte, contentType string)
	OnConnectionRequested(ip string, deviceName string)
	OnDevicesDiscovered(jsonString string)
}

type androidBridgeProxy struct{ cb BridgeCallback }

func (p *androidBridgeProxy) OnClipboardReceived(data []byte, contentType string) {
	p.cb.OnClipboardDataReceived(data, contentType)
}

func UpdateLocalIP(ip string) {
	ipMutex.Lock()
	mobileLocalIP = ip
	ipMutex.Unlock()
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

	// ── DISCOVERY START ──
	discovery.Start(
		func() string { return mobileDeviceName },
		"android",
		func() []string {
			ipMutex.RLock()
			defer ipMutex.RUnlock()
			if mobileLocalIP != "" {
				return []string{mobileLocalIP}
			}
			return sys.GetLocalIPs() // Fallback
		},
		func(devices []discovery.DiscoveredDevice) {
			if cbProxy != nil && cbProxy.cb != nil {
				jsonBytes, _ := json.Marshal(devices)
				cbProxy.cb.OnDevicesDiscovered(string(jsonBytes))
			}
		},
	)
}

func SetDeviceName(name string) { mobileDeviceName = name }

func UpdateExposedDir(dir string) {
	dirMutex.Lock()
	currentExposedDir = dir
	dirMutex.Unlock()
}

func UpdateDownloadDir(dir string) {
	dlMutex.Lock()
	currentDownloadDir = dir
	dlMutex.Unlock()
}

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
	cancelTransfersForIP(ip)
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

func resolveMobilePath(reqPath string) (string, string, error) {
	if reqPath == "" {
		reqPath = "/"
	}
	cleanVirtual := filepath.Clean("/" + reqPath)
	baseDir := getExposedDir()
	absPhysical := filepath.Join(baseDir, cleanVirtual)

	if !strings.HasPrefix(absPhysical, baseDir) {
		return "", "", fmt.Errorf("path traversal denied")
	}
	return absPhysical, cleanVirtual, nil
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
								cancelTransfersForIP(ip)
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
			clientIP, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				clientIP = r.RemoteAddr
			}
			clientIP = strings.TrimPrefix(clientIP, "::ffff:")
			if clientIP == "::1" {
				clientIP = "127.0.0.1"
			}

			cancelTransfersForIP(clientIP)
			sessionManager.RemoveSession(clientIP)
			if cbProxy != nil && cbProxy.cb != nil {
				cbProxy.cb.OnDeviceDropped(clientIP)
			}
			w.WriteHeader(http.StatusOK)
		}))

		mux.HandleFunc("/api/files/list", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")

			absPhysical, cleanVirtual, err := resolveMobilePath(r.URL.Query().Get("path"))
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			entries, err := os.ReadDir(absPhysical)
			if err != nil {
				json.NewEncoder(w).Encode(map[string]interface{}{
					"path":   cleanVirtual,
					"parent": filepath.Dir(cleanVirtual),
					"files":  []models.FileInfo{},
				})
				return
			}

			var files []models.FileInfo
			for _, entry := range entries {
				// Hide Android system dotfiles
				if strings.HasPrefix(entry.Name(), ".") {
					continue
				}

				info, err := entry.Info()
				if err != nil {
					continue
				}

				relPath := filepath.ToSlash(filepath.Join(cleanVirtual, entry.Name()))

				files = append(files, models.FileInfo{
					Name:    entry.Name(),
					Path:    relPath,
					Size:    info.Size(),
					IsDir:   entry.IsDir(),
					ModTime: info.ModTime().Format("2006-01-02 15:04"),
				})
			}

			// Sort correctly (Folders first, then A-Z)
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
			if files == nil {
				files = []models.FileInfo{}
			}

			json.NewEncoder(w).Encode(map[string]interface{}{
				"path":   cleanVirtual,
				"parent": parent,
				"files":  files,
			})
		}))

		mux.HandleFunc("/api/files/download", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			absPhysical, _, err := resolveMobilePath(r.URL.Query().Get("path"))
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			info, err := os.Stat(absPhysical)
			if err != nil || info.IsDir() {
				http.Error(w, "File not found", http.StatusNotFound)
				return
			}

			f, err := os.Open(absPhysical)
			if err != nil {
				http.Error(w, "Cannot read file", http.StatusInternalServerError)
				return
			}
			defer f.Close()

			w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filepath.Base(absPhysical)))
			w.Header().Set("Content-Type", "application/octet-stream")
			http.ServeContent(w, r, filepath.Base(absPhysical), info.ModTime(), f)
		}))

		mux.HandleFunc("/api/files/upload", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			absPhysical, _, err := resolveMobilePath(r.URL.Query().Get("dir"))
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			clientIP, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				clientIP = r.RemoteAddr
			}
			clientIP = strings.TrimPrefix(clientIP, "::ffff:")
			if clientIP == "::1" {
				clientIP = "127.0.0.1"
			}

			transferCtx, cancelTransfer := context.WithCancel(r.Context())
			registerTransfer(clientIP, cancelTransfer)
			defer cancelTransfer()

			reader, err := r.MultipartReader()
			if err != nil {
				http.Error(w, "Failed to read multipart stream", http.StatusBadRequest)
				return
			}

			os.MkdirAll(absPhysical, 0755)

			for {
				part, err := reader.NextPart()
				if err == io.EOF {
					break
				}
				if err != nil {
					continue
				}

				if part.FormName() == "files" {
					filename := filepath.Base(part.FileName()) // Strip malicious traversal attempts
					if filename == "" || filename == "." || filename == "/" {
						continue
					}

					dst, err := os.Create(filepath.Join(absPhysical, filename))
					if err == nil {
						_, copyErr := io.Copy(dst, &ctxReader{r: part, ctx: transferCtx})
						dst.Close()
						if copyErr != nil {
							os.Remove(dst.Name())
							continue
						}
					}
				}
			}
			w.WriteHeader(http.StatusOK)
		}))

		mux.HandleFunc("/api/files/mkdir", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			absPhysical, _, err := resolveMobilePath(r.URL.Query().Get("dir"))
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			name := r.URL.Query().Get("name")
			if name == "" || strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
				http.Error(w, "Invalid directory name", http.StatusBadRequest)
				return
			}

			os.MkdirAll(filepath.Join(absPhysical, name), 0755)
			w.WriteHeader(http.StatusOK)
		}))

		mux.HandleFunc("/api/clipboard/share", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			clipboardManager.HandleClipboardPost(w, r)
		}))

		mux.HandleFunc("/api/files/cancel", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			clientIP, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				clientIP = r.RemoteAddr
			}
			clientIP = strings.TrimPrefix(clientIP, "::ffff:")
			if clientIP == "::1" {
				clientIP = "127.0.0.1"
			}

			cancelTransfersForIP(clientIP)
			w.WriteHeader(http.StatusOK)
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
