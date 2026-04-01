package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	stdruntime "runtime"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ============================================================================
// DATA STRUCTURES
// ============================================================================

// FileInfo is the universal API contract structure
type FileInfo struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"isDir"`
	ModTime string `json:"modTime"`
}

// TransferProgress is the payload sent to React for UI updates
type TransferProgress struct {
	ID          string  `json:"id"`
	Filename    string  `json:"filename"`
	Total       int64   `json:"total"`
	Transferred int64   `json:"transferred"`
	Percent     int     `json:"percent"`
	SpeedMBps   float64 `json:"speedMBps"`
	ETASeconds  int     `json:"etaSeconds"`
}

// DeviceIdentity holds the handshake payload
type DeviceIdentity struct {
	IP         string `json:"ip"`
	DeviceName string `json:"deviceName"`
	OS         string `json:"os"`
	Type       string `json:"type"`
}

// progressTracker wraps an io.Reader to track speed and emit Wails events
type progressTracker struct {
	io.Reader
	ctx         context.Context
	id          string
	filename    string
	total       int64
	transferred int64
	lastEmit    time.Time
	lastBytes   int64
}

// IdentifyDevice pings an IP to see if it's a LanSync device and grabs its details.
func (a *App) IdentifyDevice(inputIP string) (DeviceIdentity, error) {
	targetIP := inputIP
	// If the user didn't type a port, invisibly append our default production port
	if !strings.Contains(targetIP, ":") {
		targetIP = targetIP + ":34932"
	}

	client := http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://%s/api/identify", targetIP))
	if err != nil {
		return DeviceIdentity{}, fmt.Errorf("could not reach device")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return DeviceIdentity{}, fmt.Errorf("device rejected connection")
	}

	var result DeviceIdentity
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return DeviceIdentity{}, fmt.Errorf("invalid handshake response")
	}

	result.IP = targetIP // Store the fully resolved IP:Port
	return result, nil
}

func (pt *progressTracker) Read(p []byte) (int, error) {
	n, err := pt.Reader.Read(p)
	if n > 0 {
		pt.transferred += int64(n)

		now := time.Now()
		elapsed := now.Sub(pt.lastEmit).Seconds()

		// Throttle UI updates to ~4 times a second
		if elapsed >= 0.25 || pt.transferred == pt.total {

			// FIX: Prevent divide-by-zero which causes the +Inf JSON crash
			speedBps := 0.0
			if elapsed > 0 {
				speedBps = float64(pt.transferred-pt.lastBytes) / elapsed
			}

			eta := 0
			if speedBps > 0 {
				eta = int(float64(pt.total-pt.transferred) / speedBps)
			}

			percent := 0
			if pt.total > 0 {
				percent = int((float64(pt.transferred) / float64(pt.total)) * 100)
			}

			payload := TransferProgress{
				ID:          pt.id,
				Filename:    pt.filename,
				Total:       pt.total,
				Transferred: pt.transferred,
				Percent:     percent,
				SpeedMBps:   speedBps / 1024 / 1024,
				ETASeconds:  eta,
			}

			runtime.EventsEmit(pt.ctx, "transfer_progress", payload)

			pt.lastEmit = now
			pt.lastBytes = pt.transferred
		}
	}
	return n, err
}

// App application struct
type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// Start the background server for Android to connect to
	go a.startBackgroundServer()
}

// ============================================================================
// PART 1: WAILS BINDINGS (Called by Desktop React UI)
// ============================================================================

func (a *App) GetLocalIP() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return "127.0.0.1"
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := iface.Addrs()
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip4 := ip.To4(); ip4 != nil && !ip4.IsLoopback() {
				return ip4.String()
			}
		}
	}
	return "127.0.0.1"
}

func (a *App) GetRemoteFiles(androidIP string, targetPath string) (map[string]interface{}, error) {
	if targetPath == "" {
		targetPath = "/"
	}

	baseURL, _ := url.Parse(fmt.Sprintf("http://%s/api/files/list", androidIP))
	params := url.Values{}
	params.Add("path", targetPath)
	baseURL.RawQuery = params.Encode()

	resp, err := http.Get(baseURL.String())
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Android: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("android returned error status: %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to parse Android response: %v", err)
	}

	return result, nil
}

// DownloadFile handles a single file download with a native OS Save dialog.
// The OS natively handles the "File already exists. Replace?" prompt.
func (a *App) DownloadFile(androidIP string, androidPath string) (string, error) {
	fileName := filepath.Base(androidPath)

	// Native OS Save Dialog
	destPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save File",
		DefaultFilename: fileName,
	})

	if err != nil || destPath == "" {
		return "", nil // User cancelled
	}

	err = a.streamFileFromAndroid(androidIP, androidPath, destPath)
	return destPath, err
}

// DownloadFolder handles folder downloads and custom Merge collision prompts.
func (a *App) DownloadFolder(androidIP string, androidPath string) (string, error) {
	// Native OS Directory Picker
	parentDir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Destination to Save Folder",
	})

	if err != nil || parentDir == "" {
		return "", nil // User cancelled
	}

	folderName := filepath.Base(androidPath)
	targetDir := filepath.Join(parentDir, folderName)

	// Collision Check: Does the folder already exist?
	if info, err := os.Stat(targetDir); err == nil && info.IsDir() {
		result, _ := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:          runtime.QuestionDialog,
			Title:         "Folder Already Exists",
			Message:       fmt.Sprintf("The destination already contains a folder named '%s'.\n\nDo you want to merge the downloaded files into this existing folder? Identical files will be replaced.", folderName),
			DefaultButton: "Merge",
			CancelButton:  "Cancel",
		})

		if result != "Merge" && result != "Yes" {
			return "", nil // User cancelled the merge
		}
	}

	os.MkdirAll(targetDir, 0755)
	err = a.pullDirectoryRecursive(androidIP, androidPath, targetDir)
	return targetDir, err
}

// Recursive helper
func (a *App) pullDirectoryRecursive(androidIP string, currentAndroidPath string, currentSaveDir string) error {
	result, err := a.GetRemoteFiles(androidIP, currentAndroidPath)
	if err != nil {
		return err
	}

	filesInterface, ok := result["files"].([]interface{})
	if !ok {
		return nil
	}

	for _, f := range filesInterface {
		fileMap := f.(map[string]interface{})
		name := fileMap["name"].(string)
		path := fileMap["path"].(string)
		isDir := fileMap["isDir"].(bool)

		destPath := filepath.Join(currentSaveDir, name)

		if isDir {
			os.MkdirAll(destPath, 0755)
			a.pullDirectoryRecursive(androidIP, path, destPath)
		} else {
			a.streamFileFromAndroid(androidIP, path, destPath)
		}
	}
	return nil
}

// Internal stream helper (no dialogs)
func (a *App) streamFileFromAndroid(androidIP string, androidPath string, destPath string) error {
	baseURL, _ := url.Parse(fmt.Sprintf("http://%s/api/files/download", androidIP))
	params := url.Values{}
	params.Add("path", androidPath)
	baseURL.RawQuery = params.Encode()

	resp, err := http.Get(baseURL.String())
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("android returned error: %s", resp.Status)
	}

	f, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer f.Close()

	tracker := &progressTracker{
		Reader:   resp.Body,
		ctx:      a.ctx,
		id:       fmt.Sprintf("dl_%d", time.Now().UnixNano()),
		filename: filepath.Base(destPath),
		total:    resp.ContentLength,
		lastEmit: time.Now(),
	}

	_, err = io.Copy(f, tracker)
	if err == nil {
		runtime.EventsEmit(a.ctx, "transfer_complete", tracker.id)
	}
	return err
}

// Dialogs
func (a *App) SelectFiles() ([]string, error) {
	return runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{Title: "Select Files to Send"})
}

func (a *App) SelectDirectory() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "Select Folder"})
}

// PushToAndroid streams files sequentially, forcing URL encoding for names to protect emojis/spaces
func (a *App) PushToAndroid(androidIP string, targetDir string, filePaths []string) error {
	for _, path := range filePaths {
		err := a.uploadSingleFile(androidIP, targetDir, path)
		if err != nil {
			return err
		}
	}
	return nil
}

// PushFolderToAndroid crawls a local directory and uploads everything recursively
func (a *App) PushFolderToAndroid(androidIP string, targetDir string, localFolder string) error {
	if localFolder == "" {
		return nil
	}

	folderName := filepath.Base(localFolder)
	baseTarget := targetDir + "/" + folderName

	return filepath.Walk(localFolder, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		relPath, _ := filepath.Rel(localFolder, path)
		fileTargetDir := baseTarget + "/" + filepath.ToSlash(filepath.Dir(relPath))

		// Clean up trailing slashes if file is at the root of the selected folder
		fileTargetDir = strings.TrimSuffix(fileTargetDir, "/")
		if fileTargetDir == baseTarget+"/." {
			fileTargetDir = baseTarget
		}

		return a.uploadSingleFile(androidIP, fileTargetDir, path)
	})
}

// uploadSingleFile isolates the multipart stream to protect memory on 100GB files
func (a *App) uploadSingleFile(androidIP string, targetDir string, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()
	stat, _ := file.Stat()

	// Safely encode emojis, spaces, and special chars in the URL parameters
	baseURL, _ := url.Parse(fmt.Sprintf("http://%s/api/files/upload", androidIP))
	params := url.Values{}
	params.Add("dir", targetDir)
	params.Add("name", filepath.Base(filePath))
	baseURL.RawQuery = params.Encode()

	pr, pw := io.Pipe()
	writer := multipart.NewWriter(pw)

	tracker := &progressTracker{
		Reader:   file,
		ctx:      a.ctx,
		id:       fmt.Sprintf("ul_%d", time.Now().UnixNano()),
		filename: filepath.Base(filePath),
		total:    stat.Size(),
		lastEmit: time.Now(),
	}

	go func() {
		defer pw.Close()
		defer writer.Close()
		part, err := writer.CreateFormFile("file", filepath.Base(filePath))
		if err == nil {
			io.Copy(part, tracker)
		}
		runtime.EventsEmit(a.ctx, "transfer_complete", tracker.id)
	}()

	req, err := http.NewRequest("POST", baseURL.String(), pr)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	runtime.EventsEmit(a.ctx, "upload_start")
	client := &http.Client{}
	resp, err := client.Do(req)
	runtime.EventsEmit(a.ctx, "upload_complete")

	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("android rejected upload: HTTP %d", resp.StatusCode)
	}
	return nil
}

// ============================================================================
// PART 2: BACKGROUND SERVER (For Android to browse the PC)
// ============================================================================

func (a *App) startBackgroundServer() {
	mux := http.NewServeMux()

	corsMiddleware := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			next(w, r)
		}
	}

	mux.HandleFunc("/api/files/list", corsMiddleware(a.handleListFiles))
	mux.HandleFunc("/api/files/download", corsMiddleware(a.handleDownload))
	mux.HandleFunc("/api/files/upload", corsMiddleware(a.handleUpload))
	mux.HandleFunc("/api/files/mkdir", corsMiddleware(a.handleMkdir))
	mux.HandleFunc("/api/identify", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		hostname, _ := os.Hostname()
		json.NewEncoder(w).Encode(map[string]string{
			"deviceName": hostname,
			"os":         stdruntime.GOOS, // Native Go constant ("windows", "darwin", "linux")
			"type":       "desktop",
		})
	}))

	// Desktop server runs on 34931
	http.ListenAndServe(":34931", mux)
}

func (a *App) handleListFiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	reqPath := r.URL.Query().Get("path")
	if reqPath == "" {
		reqPath, _ = os.UserHomeDir()
	}

	absPath, err := filepath.Abs(reqPath)
	if err != nil {
		http.Error(w, `{"error": "Invalid path"}`, http.StatusBadRequest)
		return
	}

	entries, err := os.ReadDir(absPath)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	files := []FileInfo{}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		files = append(files, FileInfo{
			Name:    entry.Name(),
			Path:    filepath.Join(absPath, entry.Name()),
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

	parent := filepath.Dir(absPath)
	if parent == absPath {
		parent = ""
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"path":   absPath,
		"parent": parent,
		"files":  files,
	})
}

func (a *App) handleDownload(w http.ResponseWriter, r *http.Request) {
	reqPath := r.URL.Query().Get("path")
	if reqPath == "" {
		http.Error(w, "Missing path", http.StatusBadRequest)
		return
	}

	info, err := os.Stat(reqPath)
	if err != nil || info.IsDir() {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	f, err := os.Open(reqPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer f.Close()

	name := filepath.Base(reqPath)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, name))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeContent(w, r, name, info.ModTime(), f)
}

func (a *App) handleUpload(w http.ResponseWriter, r *http.Request) {
	targetDir := r.URL.Query().Get("dir")
	if targetDir == "" {
		targetDir, _ = os.UserHomeDir()
	}

	r.ParseMultipartForm(10 << 20)
	file, header, err := r.FormFile("files")
	if err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	defer file.Close()

	destPath := filepath.Join(targetDir, header.Filename)
	dst, err := os.Create(destPath)
	if err != nil {
		http.Error(w, "Could not save file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()
	io.Copy(dst, file)

	w.WriteHeader(http.StatusOK)
}

func (a *App) handleMkdir(w http.ResponseWriter, r *http.Request) {
	targetDir := r.URL.Query().Get("dir")
	folderName := r.URL.Query().Get("name")

	if targetDir == "" {
		targetDir, _ = os.UserHomeDir()
	}

	if folderName == "" {
		http.Error(w, "Folder name is required", http.StatusBadRequest)
		return
	}

	newPath := filepath.Join(targetDir, folderName)
	err := os.MkdirAll(newPath, 0755)
	if err != nil {
		http.Error(w, "Failed to create folder", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"success"}`))
}
