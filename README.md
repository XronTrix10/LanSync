# LANSync

LANSync is a seamless, cross-platform local network synchronization tool designed to make sharing files, folders, and clipboard data between your PC and mobile devices instant and effortless. 

By bypassing the cloud entirely, LANSync utilizes your local Wi-Fi network to achieve maximum transfer speeds with zero data limits, complete privacy, and no external servers.

<center><img src="https://lansync.xrontrix.workers.dev/screenshot.png" width="100%"></center>

## Features

* **Blazing Fast Transfers:** Maximize your local router's bandwidth. No internet connection required.
* **Auto Host Discovery:** Automatically detects other active LANSync devices on your local network—no manual IP configuration needed.
* **Recursive Folder Sharing:** Instantly sync entire directory trees.
* **Intuitive Drag & Drop:** Easily drag and drop files and folders directly into the Desktop app for quick sharing. *(Note: Windows currently supports transfers up to 2GB per file).*
* **Smart Space Checker:** Pre-flight storage validation checks the receiving device's available space before initiating a transfer, preventing crashes and corrupted disks.
* **Transfer Cancellations:** Instantly cancel active uploads or downloads. LANSync automatically rolls back and cleans up any partially transferred files.
* **Clipboard Sync:** Seamlessly copy text on your PC and paste it on your phone (and vice-versa) with a single click.
* **Secure Peer-to-Peer:** Custom token-based authentication and connection request modals ensure no one accesses your files without explicit permission.
* **True Background Execution:** The Android app utilizes a lightweight Foreground Service and Partial WakeLocks, ensuring transfers never drop when your screen turns off.
* **Native OS Integration:** Features native macOS unified titlebars, Windows/Linux frameless windows, and dynamic device recognition.

## Tech Stack

LANSync is built using a modern, hybrid architecture to ensure maximum performance and a beautiful native feel across all devices.

**Desktop Client**
* **Core:** [Wails v2](https://wails.io/) (Go)
* **Frontend:** React 19, TypeScript, Tailwind CSS V4
* **Icons:** Lucide React

**Mobile Client (Android)**
* **Core:** Kotlin, Jetpack Compose (Material Design 3)
* **Networking Bridge:** Go Mobile (`gomobile bind`)
* **Background Engine:** Android Foreground Services & WakeLocks

## Installation Guides

Download the latest release for your platform from the Releases page and follow the instructions below:

### Windows
1. Download the `lansync-setup.exe` installer.
2. Double-click the installer to run it.
3. **Note:** If Windows Defender SmartScreen prevents the app from starting, click **More info**, and then click **Run anyway**.

### macOS
1. Download and extract the `lansync-macos.zip` file.
2. Move the extracted `LANSync.app` to your Applications folder.
3. To bypass the macOS "unidentified developer" quarantine, open your Terminal and run the following command:
   ```bash
   xattr -cr /Applications/LANSync.app
   ```
   *(If you left the app in your Downloads folder, run `xattr -cr ~/Downloads/LANSync.app` instead).*
4. Double-click to open the app.

### Linux (Ubuntu/Debian)
1. Download the `lansync-linux-amd64.deb` package.
2. Open your terminal and navigate to your downloads folder.
3. Install the package using dpkg:
   ```bash
   sudo dpkg -i lansync-linux-amd64.deb
   ```
4. *(Optional)* If you encounter any missing dependency errors, run `sudo apt-get install -f` to resolve them. 

### Android
1. Download the `lansync-debug.apk` file to your mobile device.
2. Tap the downloaded file to open it.
3. Your device may prompt you that it is not allowed to install unknown apps. Tap **Settings** on the prompt, and toggle on **Allow from this source** (or "Install from unknown sources").
4. Go back and tap **Install** to complete the setup.

## Getting Started (For Developers)

### Prerequisites
* Go 1.20+
* Node.js & npm (for Desktop frontend)
* Android Studio (for Mobile client)
* `gomobile` installed and configured

### Building the Desktop App
1. Clone the repository.
2. Navigate to the desktop directory: `cd desktop`
3. Install Wails CLI if you haven't already: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
4. Run in dev mode: `wails dev`
   - `wails dev -tags webkit2_41` for later ubuntu
5. Build the final executable: `wails build`
   - `wails build -tags webkit2_41` for later ubuntu

### Building the Android App

**Prerequisites:**
Before compiling, ensure your development environment is fully set up for Android and Go:
* **Go:** Version 1.20 or higher.
* **Java:** JDK installed (JDK 21 recommended).
* **Android Studio:** Open the **SDK Manager** (`Tools > SDK Manager`) and ensure the following are installed:
  * **SDK Platforms:** Android API 30 (Android 11.0)
  * **SDK Tools:** NDK (Side by side) and CMake
* **Environment Variables:** Ensure `ANDROID_HOME` and `ANDROID_NDK_HOME` are correctly configured on your system so `gomobile` can locate the compilation tools.

**Build Steps:**
1. Navigate to the desktop bridge directory and compile the Go library for Android:
   ```bash
   gomobile bind -target=android -androidapi 30 -o ../mobile/app/libs/bridge.aar ./bridge
   ```
2. Open the `mobile` folder in Android Studio.
3. Sync the project with Gradle files.
4. Build and run on your Android device (Android 11.0+).


## How it Works

LANSync operates on a dual-server architecture. When devices pair, they exchange temporary cryptographic bearer tokens. Both the Desktop and Mobile apps spin up lightweight Go HTTP servers (defaulting to port `34931`) to handle bidirectional streaming. The Android app leverages a custom threaded download engine to bypass OS-level HTTP restrictions, providing real-time speed and progress metrics directly in the notification tray.
