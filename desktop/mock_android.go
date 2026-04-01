package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// FileInfo matches our Universal API Contract
type FileInfo struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"isDir"`
	ModTime string `json:"modTime"`
}

func main() {
	// The folder we are pretending is the Android internal storage
	mockStorageRoot, _ := filepath.Abs("./mock_storage")
	os.MkdirAll(mockStorageRoot, 0755)

	mux := http.NewServeMux()

	// 0. Handshake API
	mux.HandleFunc("/api/identify", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(map[string]string{
			"deviceName": "Mock Pixel 7",
			"os":         "Android",
			"type":       "mobile",
		})
	})

	// 1. Mock List API
	mux.HandleFunc("/api/files/list", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		reqPath := r.URL.Query().Get("path")
		if reqPath == "" || reqPath == "/" {
			reqPath = mockStorageRoot
		}

		entries, err := os.ReadDir(reqPath)
		if err != nil {
			http.Error(w, `{"error": "Directory not found"}`, http.StatusNotFound)
			return
		}

		files := []FileInfo{}
		for _, entry := range entries {
			if strings.HasPrefix(entry.Name(), ".") {
				continue
			}
			info, _ := entry.Info()
			files = append(files, FileInfo{
				Name:    entry.Name(),
				Path:    filepath.Join(reqPath, entry.Name()),
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

		parent := filepath.Dir(reqPath)
		if parent == reqPath || reqPath == mockStorageRoot {
			parent = "" // At root
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"path":   reqPath,
			"parent": parent,
			"files":  files,
		})
	})

	// 2. Mock Download API
	mux.HandleFunc("/api/files/download", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		reqPath := r.URL.Query().Get("path")
		info, err := os.Stat(reqPath)
		if err != nil || info.IsDir() {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}
		f, _ := os.Open(reqPath)
		defer f.Close()

		name := filepath.Base(reqPath)
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, name))
		w.Header().Set("Content-Type", "application/octet-stream")
		http.ServeContent(w, r, name, info.ModTime(), f)
	}))

	// 3. Mock Upload API (Hardened for UTF-8 safety and Folder Creation)
	mux.HandleFunc("/api/files/upload", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		// 1. FORCE CORS HEADERS ON THE RESPONSE
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "*")

		// 2. Handle the invisible browser preflight check
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		targetDir := r.URL.Query().Get("dir")
		if targetDir == "" || targetDir == "/" {
			targetDir = mockStorageRoot
		}

		// When uploading a whole folder, the target directory might not exist yet!
		os.MkdirAll(targetDir, 0755)

		// Read the safe filename from the URL query string to protect emojis/spaces
		explicitName := r.URL.Query().Get("name")

		// Increased limit for testing
		r.ParseMultipartForm(500 << 20)

		// Note: app.go now sends the field as "file" instead of "files"
		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "Bad Request: Missing 'file' field", http.StatusBadRequest)
			return
		}
		defer file.Close()

		// Fallback just in case
		fileName := explicitName
		if fileName == "" {
			fileName = header.Filename
		}

		destPath := filepath.Join(targetDir, fileName)
		dst, err := os.Create(destPath)
		if err != nil {
			http.Error(w, "Could not save file", http.StatusInternalServerError)
			return
		}
		defer dst.Close()
		io.Copy(dst, file)

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"success"}`))
	}))

	// 4. Mock Create Folder API (Handles spaces natively)
	mux.HandleFunc("/api/files/mkdir", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		targetDir := r.URL.Query().Get("dir")
		folderName := r.URL.Query().Get("name")

		if targetDir == "" || targetDir == "/" {
			targetDir = mockStorageRoot
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
	}))

	fmt.Println("📱 Mock Android Server running on http://127.0.0.1:34932")
	fmt.Println("Serving directory:", mockStorageRoot)
	log.Fatal(http.ListenAndServe(":34932", mux))
}

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Allow any origin to connect (or restrict to "http://wails.localhost:34115")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, Authorization, accept, origin, Cache-Control, X-Requested-With")

		// Instantly approve the browser's invisible OPTIONS preflight request
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Proceed to the actual upload logic
		next(w, r)
	}
}
