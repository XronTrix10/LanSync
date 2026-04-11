package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	stdruntime "runtime"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"lansync/internal/auth"
	"lansync/internal/client"
	"lansync/internal/clipboard"
	"lansync/internal/config"
	"lansync/internal/discovery"
	"lansync/internal/server"
	"lansync/internal/sys"
)

type App struct {
	ctx              context.Context
	sessionManager   *auth.SessionManager
	androidClient    *client.AndroidClient
	desktopServer    *server.DesktopServer
	clipboardManager *clipboard.ClipboardManager
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.sessionManager = auth.NewSessionManager(func(droppedIP string) {
		a.CancelTransfers(droppedIP) // Ensures disconnect sweeps all streams
		runtime.EventsEmit(a.ctx, "connection_lost", droppedIP)
	})

	a.clipboardManager = clipboard.NewClipboardManager(ctx, a.sessionManager, false)
	a.androidClient = client.NewAndroidClient(ctx, a.sessionManager)
	a.desktopServer = server.NewDesktopServer(a.sessionManager, a.clipboardManager)
	a.desktopServer.SetContext(ctx)

	go a.desktopServer.Start("34931")

	discovery.Start(
		func() string { return config.Load().DeviceName },
		stdruntime.GOOS,
		func(devices []discovery.DiscoveredDevice) {
			runtime.EventsEmit(a.ctx, "devices_discovered", devices)
		},
	)
}

// ── THE KILL SWITCH TRIGGER (Called from React UI) ──
func (a *App) CancelTransfers(ip string) {
	// 1. Kill local Desktop SERVER receiving streams
	server.CancelTransfersForIP(ip)

	// 2. Kill local Desktop CLIENT sending/downloading streams
	client.CancelClientTransfersForIP(ip)

	// 3. Tell the Mobile device over network to kill its streams too
	token := a.sessionManager.GetOutboundToken(ip)
	if token != "" {
		go func() {
			req, _ := http.NewRequest("POST", fmt.Sprintf("http://%s:34931/api/files/cancel", ip), nil)
			req.Header.Set("Authorization", "Bearer "+token)
			c := http.Client{Timeout: 2 * time.Second}
			c.Do(req)
		}()
	}
}

func (a *App) RequestConnection(ip string, port string) (string, error) {
	return a.androidClient.RequestConnection(ip, port, config.Load().DeviceName)
}

func (a *App) AcceptConnection(ip string) { a.desktopServer.ResolveConnection(ip, true) }
func (a *App) RejectConnection(ip string) { a.desktopServer.ResolveConnection(ip, false) }

func (a *App) Disconnect(ip string) {
	// Execute the full kill sequence on disconnect
	a.CancelTransfers(ip)

	token := a.sessionManager.GetOutboundToken(ip)
	if token != "" {
		go func() {
			req, _ := http.NewRequest("POST", fmt.Sprintf("http://%s:34931/api/disconnect", ip), nil)
			req.Header.Set("Authorization", "Bearer "+token)
			c := http.Client{Timeout: 2 * time.Second}
			c.Do(req)
		}()
	}
	a.sessionManager.RemoveSession(ip)
	runtime.EventsEmit(a.ctx, "connection_lost", ip)
}

// Helper to check target space before transfers
func (a *App) checkTargetSpace(ip string, requiredBytes int64) error {
	token := a.sessionManager.GetOutboundToken(ip)
	req, _ := http.NewRequest("GET", fmt.Sprintf("http://%s:34931/api/system/space", ip), nil)
	req.Header.Set("Authorization", "Bearer "+token)

	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		return nil
	}
	defer resp.Body.Close()

	var data map[string]uint64
	// json.NewDecoder(resp.Body).Decode(&data)
	if free, ok := data["free_space"]; ok {
		if uint64(requiredBytes) > (free - 50_000_000) {
			return fmt.Errorf("not enough space on target device. Requires %d MB but only %d MB free", requiredBytes/1024/1024, free/1024/1024)
		}
	}
	return nil
}

func (a *App) GetLocalIPs() []string { return sys.GetLocalIPs() }
func (a *App) GetHostName() string {
	hostname, err := os.Hostname()
	if err != nil {
		return "My PC"
	}
	return hostname
}
func (a *App) IdentifyDevice(ip string) (interface{}, error) {
	return a.androidClient.IdentifyDevice(ip)
}
func (a *App) GetRemoteFiles(ip string, port string, path string) (map[string]interface{}, error) {
	return a.androidClient.GetRemoteFiles(ip, port, path)
}
func (a *App) PushToAndroid(ip string, port string, dir string, paths []string) error {
	// Pre-Flight Size Check
	var totalSize int64
	for _, p := range paths {
		if info, err := os.Stat(p); err == nil {
			totalSize += info.Size()
		}
	}
	if err := a.checkTargetSpace(ip, totalSize); err != nil {
		return err
	}
	return a.androidClient.PushToAndroid(ip, port, dir, paths)
}
func (a *App) PushFolderToAndroid(ip string, port string, dir string, local string) error {
	// Pre-Flight Size Check
	var totalSize int64
	filepath.Walk(local, func(_ string, info os.FileInfo, _ error) error {
		if info != nil && !info.IsDir() {
			totalSize += info.Size()
		}
		return nil
	})
	if err := a.checkTargetSpace(ip, totalSize); err != nil {
		return err
	}
	return a.androidClient.PushFolderToAndroid(ip, port, dir, local)
}
func (a *App) SelectFiles() ([]string, error) {
	return runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{Title: "Select Files to Send"})
}
func (a *App) SelectDirectory() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "Select Folder"})
}
func (a *App) MakeDirectory(ip string, port string, dir string, name string) error {
	return a.androidClient.MakeDirectory(ip, port, dir, name)
}
func (a *App) GetSessionToken(ip string) string { return a.sessionManager.GetOutboundToken(ip) }
func (a *App) GetHomeDir() string {
	home, _ := os.UserHomeDir()
	return home
}
func (a *App) GetSharedDir() string {
	cfg := config.Load()
	if cfg.SharedDir == "" {
		home, _ := os.UserHomeDir()
		return home
	}
	return cfg.SharedDir
}
func (a *App) SaveSharedDir(path string) error {
	cfg := config.Load()
	cfg.SharedDir = path
	err := config.Save(cfg)
	if err == nil {
		a.desktopServer.SharedDir = path
	}
	return err
}
func (a *App) ShareClipboardText(ip string, port string) error {
	if a.sessionManager.GetOutboundToken(ip) == "" {
		return fmt.Errorf("device not securely connected")
	}
	return a.clipboardManager.ShareDesktopText(ip, port)
}
func (a *App) DownloadFile(ip string, port string, path string) (string, error) {
	destPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title: "Save File", DefaultFilename: filepath.Base(path),
	})
	if err != nil || destPath == "" {
		return "", nil
	}
	err = a.androidClient.StreamFileFromAndroid(ip, port, path, destPath)
	return destPath, err
}
func (a *App) GetDeviceName() string { return config.Load().DeviceName }
func (a *App) SaveDeviceName(name string) error {
	cfg := config.Load()
	cfg.DeviceName = name
	return config.Save(cfg)
}
func (a *App) DownloadFolder(ip string, port string, path string) (string, error) {
	parentDir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Destination",
	})
	if err != nil || parentDir == "" {
		return "", nil
	}

	folderName := filepath.Base(path)
	targetDir := filepath.Join(parentDir, folderName)
	if info, err := os.Stat(targetDir); err == nil && info.IsDir() {
		result, _ := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type: runtime.QuestionDialog, Title: "Folder Exists",
			Message:       fmt.Sprintf("Merge downloaded files into '%s'?", folderName),
			DefaultButton: "Merge", CancelButton: "Cancel",
		})
		if result != "Merge" && result != "Yes" {
			return "", nil
		}
	}

	os.MkdirAll(targetDir, 0755)
	err = a.androidClient.PullDirectoryRecursive(ip, port, path, targetDir)
	return targetDir, err
}
