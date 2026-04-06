package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"lansync/internal/auth"
	"lansync/internal/client"
	"lansync/internal/clipboard"
	"lansync/internal/config"
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
		runtime.EventsEmit(a.ctx, "connection_lost", droppedIP)
	})

	a.clipboardManager = clipboard.NewClipboardManager(ctx, a.sessionManager, false)
	a.androidClient = client.NewAndroidClient(ctx, a.sessionManager)
	a.desktopServer = server.NewDesktopServer(a.sessionManager, a.clipboardManager)
	a.desktopServer.SetContext(ctx)

	go a.desktopServer.Start("34931")
}

func (a *App) RequestConnection(ip string, port string) (string, error) {
	return a.androidClient.RequestConnection(ip, port, config.Load().DeviceName)
}

func (a *App) AcceptConnection(ip string) { a.desktopServer.ResolveConnection(ip, true) }
func (a *App) RejectConnection(ip string) { a.desktopServer.ResolveConnection(ip, false) }

func (a *App) Disconnect(ip string) {
	token := a.sessionManager.GetOutboundToken(ip)
	if token != "" {
		// Fire a polite disconnect signal to the mobile device
		go func() {
			req, _ := http.NewRequest("POST", fmt.Sprintf("http://%s:34931/api/disconnect", ip), nil)
			req.Header.Set("Authorization", "Bearer "+token)
			client := http.Client{Timeout: 2 * time.Second}
			client.Do(req)
		}()
	}
	a.sessionManager.RemoveSession(ip)
	runtime.EventsEmit(a.ctx, "connection_lost", ip)
}

func (a *App) GetLocalIPs() []string {
	return sys.GetLocalIPs()
}
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
	return a.androidClient.PushToAndroid(ip, port, dir, paths)
}
func (a *App) PushFolderToAndroid(ip string, port string, dir string, local string) error {
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
func (a *App) GetSessionToken(ip string) string {
	return a.sessionManager.GetOutboundToken(ip)
}

// ── NEW: Clipboard Binding ──
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

// GetDeviceName returns the current custom name for the frontend
func (a *App) GetDeviceName() string {
	return config.Load().DeviceName
}

// SaveDeviceName saves a new custom name and returns any errors
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
