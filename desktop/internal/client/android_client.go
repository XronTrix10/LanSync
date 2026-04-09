package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	stdruntime "runtime"
	"strings"
	"sync"
	"time"

	"lansync/internal/auth"
	"lansync/internal/models"
	"lansync/internal/sys"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ── CONTEXT-AWARE TRANSFER REGISTRY FOR DESKTOP CLIENT ──
var (
	clientTransferMutex   sync.Mutex
	activeClientTransfers = make(map[string][]context.CancelFunc)
)

func registerClientTransfer(ip string, cancel context.CancelFunc) {
	clientTransferMutex.Lock()
	activeClientTransfers[ip] = append(activeClientTransfers[ip], cancel)
	clientTransferMutex.Unlock()
}

func CancelClientTransfersForIP(ip string) {
	clientTransferMutex.Lock()
	if cancels, exists := activeClientTransfers[ip]; exists {
		for _, c := range cancels {
			c()
		}
		delete(activeClientTransfers, ip)
	}
	clientTransferMutex.Unlock()
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

// ────────────────────────────────────────────────────────

type AndroidClient struct {
	ctx            context.Context
	sessionManager *auth.SessionManager
}

func NewAndroidClient(ctx context.Context, sm *auth.SessionManager) *AndroidClient {
	return &AndroidClient{ctx: ctx, sessionManager: sm}
}

func (c *AndroidClient) IdentifyDevice(inputIP string) (models.DeviceIdentity, error) {
	portsToTry := []string{"34931", "34932"}

	if strings.Contains(inputIP, ":") {
		parts := strings.Split(inputIP, ":")
		inputIP = parts[0]
		portsToTry = []string{parts[1]}
	}

	for _, port := range portsToTry {
		client := http.Client{Timeout: 2 * time.Second}
		resp, err := client.Get(fmt.Sprintf("http://%s:%s/api/identify", inputIP, port))
		if err == nil && resp.StatusCode == http.StatusOK {
			var result models.DeviceIdentity
			json.NewDecoder(resp.Body).Decode(&result)
			result.IP = inputIP
			result.Port = port
			resp.Body.Close()
			return result, nil
		}
	}
	return models.DeviceIdentity{}, fmt.Errorf("Could not reach device")
}

func (c *AndroidClient) RequestConnection(targetIP string, targetPort string, myDeviceName string) (string, error) {
	tokenForB := c.sessionManager.GenerateToken()

	reqPayload := models.ConnectionRequest{
		DeviceIdentity: models.DeviceIdentity{
			IP:         sys.GetLocalIPs()[0],
			Port:       "34931",
			DeviceName: myDeviceName,
			OS:         stdruntime.GOOS,
			Type:       "desktop",
		},
		TokenForB: tokenForB,
	}

	jsonData, _ := json.Marshal(reqPayload)
	resp, err := http.Post(fmt.Sprintf("http://%s:%s/api/connect", targetIP, targetPort), "application/json", bytes.NewBuffer(jsonData))
	if err != nil || resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("device did not respond")
	}
	defer resp.Body.Close()

	var result models.ConnectionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if result.Accepted {
		c.sessionManager.RegisterSession(targetIP, tokenForB, result.TokenForA)
		go c.startHeartbeatLoop(targetIP, targetPort)

		finalName := result.DeviceName
		if finalName == "" {
			finalName = "Unknown Device"
		}
		return finalName, nil
	}
	return "", fmt.Errorf("connection rejected")
}

func (c *AndroidClient) startHeartbeatLoop(targetIP string, targetPort string) {
	for {
		time.Sleep(5 * time.Second)
		token := c.sessionManager.GetOutboundToken(targetIP)
		if token == "" {
			return
		}
		req, _ := http.NewRequest("GET", fmt.Sprintf("http://%s:%s/api/ping", targetIP, targetPort), nil)
		req.Header.Set("Authorization", "Bearer "+token)
		client := http.Client{Timeout: 3 * time.Second}
		client.Do(req)
	}
}

func (c *AndroidClient) GetRemoteFiles(targetIP string, targetPort string, targetPath string) (map[string]interface{}, error) {
	if targetPath == "" {
		targetPath = "/"
	}
	baseURL, _ := url.Parse(fmt.Sprintf("http://%s:%s/api/files/list", targetIP, targetPort))
	params := url.Values{}
	params.Add("path", targetPath)
	baseURL.RawQuery = params.Encode()

	req, _ := http.NewRequest("GET", baseURL.String(), nil)
	req.Header.Set("Authorization", "Bearer "+c.sessionManager.GetOutboundToken(targetIP))

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unauthorized")
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}

func (c *AndroidClient) StreamFileFromAndroid(ip string, port string, path string, destPath string) error {
	baseURL, _ := url.Parse(fmt.Sprintf("http://%s:%s/api/files/download", ip, port))
	params := url.Values{}
	params.Add("path", path)
	baseURL.RawQuery = params.Encode()

	// ── Hook into the Context Registry ──
	transferCtx, cancelTransfer := context.WithCancel(c.ctx)
	registerClientTransfer(ip, cancelTransfer)
	defer cancelTransfer()

	req, _ := http.NewRequestWithContext(transferCtx, "GET", baseURL.String(), nil)
	req.Header.Set("Authorization", "Bearer "+c.sessionManager.GetOutboundToken(ip))
	req.Header.Set("Accept-Encoding", "identity") // Ensure no gzip so length is accurate

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("error: %s", resp.Status)
	}

	f, err := os.Create(destPath)
	if err != nil {
		return err
	}

	tracker := NewProgressTracker(c.ctx, resp.Body, filepath.Base(destPath), resp.ContentLength, "dl")

	// Ensure UI clears the progress bar when done or cancelled
	defer runtime.EventsEmit(c.ctx, "transfer_complete", tracker.GetID())

	_, copyErr := io.Copy(f, &ctxReader{r: tracker, ctx: transferCtx})
	f.Close() // Must close before we can remove it

	// ── GHOST FILE ROLLBACK ──
	if copyErr != nil {
		os.Remove(destPath)
		if transferCtx.Err() != nil {
			return fmt.Errorf("Transfer was cancelled")
		}
		return copyErr
	}
	return nil
}

func (c *AndroidClient) PullDirectoryRecursive(ip, port, path, destDir string) error {
	result, err := c.GetRemoteFiles(ip, port, path)
	if err != nil {
		return err
	}

	filesInt, ok := result["files"].([]interface{})
	if !ok {
		return nil
	}

	for _, f := range filesInt {
		fileMap := f.(map[string]interface{})
		destPath := filepath.Join(destDir, fileMap["name"].(string))
		if fileMap["isDir"].(bool) {
			os.MkdirAll(destPath, 0755)
			err = c.PullDirectoryRecursive(ip, port, fileMap["path"].(string), destPath)
			if err != nil {
				return err
			} // Bubble up cancellation to stop loop
		} else {
			err = c.StreamFileFromAndroid(ip, port, fileMap["path"].(string), destPath)
			if err != nil {
				return err
			} // Bubble up cancellation to stop loop
		}
	}
	return nil
}

func (c *AndroidClient) PushToAndroid(ip, port, targetDir string, filePaths []string) error {
	for _, path := range filePaths {
		if err := c.uploadSingleFile(ip, port, targetDir, path); err != nil {
			return err // Stops subsequent files if cancelled
		}
	}
	return nil
}

func (c *AndroidClient) PushFolderToAndroid(ip, port, targetDir, localFolder string) error {
	baseTarget := targetDir + "/" + filepath.Base(localFolder)
	return filepath.Walk(localFolder, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		relPath, _ := filepath.Rel(localFolder, path)
		fileTargetDir := baseTarget + "/" + filepath.ToSlash(filepath.Dir(relPath))
		fileTargetDir = strings.TrimSuffix(fileTargetDir, "/")
		if fileTargetDir == baseTarget+"/." {
			fileTargetDir = baseTarget
		}
		return c.uploadSingleFile(ip, port, fileTargetDir, path)
	})
}

func (c *AndroidClient) uploadSingleFile(ip, port, targetDir, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()
	stat, _ := file.Stat()

	baseURL, _ := url.Parse(fmt.Sprintf("http://%s:%s/api/files/upload", ip, port))
	params := url.Values{}
	params.Add("dir", targetDir)
	params.Add("name", filepath.Base(filePath))
	baseURL.RawQuery = params.Encode()

	// ── Hook into the Context Registry ──
	transferCtx, cancelTransfer := context.WithCancel(c.ctx)
	registerClientTransfer(ip, cancelTransfer)
	defer cancelTransfer()

	pr, pw := io.Pipe()
	writer := multipart.NewWriter(pw)
	tracker := NewProgressTracker(c.ctx, file, filepath.Base(filePath), stat.Size(), "ul")

	go func() {
		defer pw.Close()
		defer writer.Close()
		defer runtime.EventsEmit(c.ctx, "transfer_complete", tracker.GetID())
		part, _ := writer.CreateFormFile("files", filepath.Base(filePath))
		// Triggers instant halt if Context is aborted
		io.Copy(part, &ctxReader{r: tracker, ctx: transferCtx})
	}()

	req, _ := http.NewRequestWithContext(transferCtx, "POST", baseURL.String(), pr)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+c.sessionManager.GetOutboundToken(ip))

	client := &http.Client{}
	runtime.EventsEmit(c.ctx, "upload_start")
	resp, err := client.Do(req)
	runtime.EventsEmit(c.ctx, "upload_complete")

	if err != nil {
		if transferCtx.Err() != nil {
			return fmt.Errorf("Transfer was cancelled")
		}
		return fmt.Errorf("upload failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Server Error %d: %s", resp.StatusCode, string(bodyBytes))
	}
	return nil
}

func (c *AndroidClient) MakeDirectory(ip string, port string, targetDir string, folderName string) error {
	baseURL, _ := url.Parse(fmt.Sprintf("http://%s:%s/api/files/mkdir", ip, port))
	params := url.Values{}
	params.Add("dir", targetDir)
	params.Add("name", folderName)
	baseURL.RawQuery = params.Encode()

	req, _ := http.NewRequest("POST", baseURL.String(), nil)
	req.Header.Set("Authorization", "Bearer "+c.sessionManager.GetOutboundToken(ip))

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("device rejected folder creation")
	}
	return nil
}
