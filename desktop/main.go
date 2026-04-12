package main

import (
	"embed"
	"runtime"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()
	isMac := runtime.GOOS == "darwin"

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "LANSync",
		Width:     1024,
		Height:    768,
		Frameless: !isMac,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		// --------------------------------------------------
		// NATIVE DRAG AND DROP CONFIGURATION
		// --------------------------------------------------
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop: true,
		},
		Mac: &mac.Options{
			TitleBar: mac.TitleBarHidden(),
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
