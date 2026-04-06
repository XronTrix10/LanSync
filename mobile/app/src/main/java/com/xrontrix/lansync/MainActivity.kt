package com.xrontrix.lansync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkRequest
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.res.painterResource
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.navigation.compose.*
import bridge.Bridge
import bridge.BridgeCallback
import com.xrontrix.lansync.data.PreferencesManager
import com.xrontrix.lansync.data.RecentDevice
import com.xrontrix.lansync.ui.screens.BrowseScreen
import com.xrontrix.lansync.ui.screens.HomeScreen
import com.xrontrix.lansync.ui.theme.LansyncTheme
import com.xrontrix.lansync.ui.theme.*
import org.json.JSONArray
import org.json.JSONObject
import android.net.Uri
import android.provider.OpenableColumns
import java.io.DataOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.withStyle
import androidx.core.net.toUri
import android.provider.DocumentsContract
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.foundation.shape.CircleShape
import androidx.core.content.edit

class MainActivity : ComponentActivity(), BridgeCallback {

    private var isNetworkAvailable = mutableStateOf(false)
    private lateinit var connectivityManager: ConnectivityManager
    private lateinit var prefsManager: PreferencesManager

    private val activeDeviceIP = mutableStateOf<String?>(null)
    private val isConnecting = mutableStateOf(false)
    private val activeDeviceOS = mutableStateOf("windows")
    private val incomingRequest = mutableStateOf<Triple<String, String, String>?>(null)

    private val recentDevicesState = mutableStateOf<List<RecentDevice>>(emptyList())
    private var currentPath = mutableStateOf("/")
    private var parentPath = mutableStateOf("")
    private var remoteFiles = mutableStateOf<List<com.xrontrix.lansync.ui.screens.FileInfo>>(emptyList())
    private var isLoadingFiles = mutableStateOf(false)

    private fun toggleForegroundService(start: Boolean) {
        val serviceIntent = Intent(this, LanSyncService::class.java)
        if (start) {
            startForegroundService(serviceIntent)
        } else {
            stopService(serviceIntent)
        }
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { isNetworkAvailable.value = getLocalIPAddress() != null }
        override fun onLost(network: Network) { isNetworkAvailable.value = getLocalIPAddress() != null }
    }

    private fun setupNetworkMonitoring() {
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val request = NetworkRequest.Builder().build()
        connectivityManager.registerNetworkCallback(request, networkCallback)
        val ip = getLocalIPAddress()
        isNetworkAvailable.value = (ip != null && ip != "127.0.0.1")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        checkAndRequestStoragePermissions()

        prefsManager = PreferencesManager(this)
        recentDevicesState.value = prefsManager.getRecentDevices()

        setupNetworkMonitoring()
        Bridge.startupWithCallback(this)

        val sharedPrefs = getSharedPreferences("lansync_prefs", Context.MODE_PRIVATE)
        val savedName = sharedPrefs.getString("device_name", android.os.Build.MODEL) ?: android.os.Build.MODEL
        try { Bridge.setDeviceName(savedName) } catch (e: Exception) {}

        val exposedUri = sharedPrefs.getString("exposed_folder", "") ?: ""
        val realExposedPath = getRealPathFromURI(exposedUri)
        try {
            Bridge.updateExposedDir(realExposedPath)
            Bridge.startMobileServer()
        } catch (e: Exception) { e.printStackTrace() }

        setContent {
            LansyncTheme {
                val navController = rememberNavController()

                val req = incomingRequest.value
                if (req != null) {
                    Dialog(
                        onDismissRequest = { /* Must explicitly click accept/reject */ },
                        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false)
                    ) {
                        Box(
                            modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)).padding(20.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Surface(
                                shape = RoundedCornerShape(24.dp),
                                color = Panel,
                                border = androidx.compose.foundation.BorderStroke(1.dp, Accent.copy(alpha = 0.3f)),
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
                            ) {
                                Column(
                                    modifier = Modifier.padding(24.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = Accent.copy(alpha = 0.1f),
                                        border = androidx.compose.foundation.BorderStroke(1.dp, Accent.copy(alpha = 0.2f)),
                                        modifier = Modifier.size(64.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Filled.Security, contentDescription = null, tint = Accent, modifier = Modifier.size(28.dp))
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(16.dp))
                                    Text("Connection Request", color = TextPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = androidx.compose.ui.text.buildAnnotatedString {
                                            withStyle(androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.Bold, color = TextPrimary)) { append(req.second) }
                                            append(" (${req.first}) wants to connect.")
                                        },
                                        color = TextMuted, fontSize = 14.sp, textAlign = TextAlign.Center
                                    )
                                    Spacer(modifier = Modifier.height(24.dp))

                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        Surface(
                                            onClick = {
                                                Bridge.resolveConnection(req.first, false)
                                                incomingRequest.value = null
                                            },
                                            color = RedAccent.copy(alpha = 0.1f),
                                            shape = RoundedCornerShape(12.dp),
                                            modifier = Modifier.weight(1f).height(45.dp)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) { Text("Reject", color = RedAccent, fontWeight = FontWeight.SemiBold, fontSize = 14.sp) }
                                        }

                                        Surface(
                                            onClick = {
                                                Bridge.resolveConnection(req.first, true)
                                                activeDeviceIP.value = req.first
                                                prefsManager.saveRecentDevice(req.first, req.second)
                                                recentDevicesState.value = prefsManager.getRecentDevices()
                                                toggleForegroundService(true) // Start the Foreground Service!
                                                incomingRequest.value = null
                                                Toast.makeText(this@MainActivity, "Connected to ${req.second}", Toast.LENGTH_SHORT).show()
                                            },
                                            color = GreenAccent.copy(alpha = 0.1f),
                                            shape = RoundedCornerShape(12.dp),
                                            modifier = Modifier.weight(1f).height(45.dp)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) { Text("Accept", color = GreenAccent, fontWeight = FontWeight.SemiBold, fontSize = 14.sp) }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                Scaffold(
                    bottomBar = {
                        val navBackStackEntry by navController.currentBackStackEntryAsState()
                        val currentRoute = navBackStackEntry?.destination?.route
                        NavigationBar(containerColor = Surface, contentColor = TextMuted) {
                            NavigationBarItem(
                                icon = {
                                    Icon(
                                        painter = painterResource(id = if (currentRoute == "home") R.drawable.home_filled else R.drawable.home_outlined),
                                        contentDescription = "Home",
                                        modifier = Modifier.size(24.dp)
                                    )
                                },
                                label = { Text("Home") },
                                selected = currentRoute == "home",
                                onClick = { navController.navigate("home") },
                                colors = NavigationBarItemDefaults.colors(selectedIconColor = Accent, selectedTextColor = Accent, indicatorColor = Accent.copy(alpha = 0.15f), unselectedIconColor = TextMuted, unselectedTextColor = TextMuted)
                            )

                            NavigationBarItem(
                                icon = {
                                    Icon(
                                        painter = painterResource(id = if (currentRoute == "browse") R.drawable.folder_filled else R.drawable.folder_outlined),
                                        contentDescription = "Browse",
                                        modifier = Modifier.size(24.dp)
                                    )
                                },
                                label = { Text("Browse") },
                                selected = currentRoute == "browse",
                                onClick = { navController.navigate("browse") },
                                colors = NavigationBarItemDefaults.colors(selectedIconColor = Accent, selectedTextColor = Accent, indicatorColor = Accent.copy(alpha = 0.15f), unselectedIconColor = TextMuted, unselectedTextColor = TextMuted)
                            )

                            NavigationBarItem(
                                icon = {
                                    Icon(
                                        painter = painterResource(id = if (currentRoute == "settings") R.drawable.settings_filled else R.drawable.settings_outlined),
                                        contentDescription = "Settings",
                                        modifier = Modifier.size(24.dp)
                                    )
                                },
                                label = { Text("Settings") },
                                selected = currentRoute == "settings",
                                onClick = { navController.navigate("settings") },
                                colors = NavigationBarItemDefaults.colors(selectedIconColor = Accent, selectedTextColor = Accent, indicatorColor = Accent.copy(alpha = 0.15f), unselectedIconColor = TextMuted, unselectedTextColor = TextMuted)
                            )
                        }
                    },
                    containerColor = BgBase
                ) { innerPadding ->
                    NavHost(navController = navController, startDestination = "home", modifier = Modifier.padding(innerPadding)) {
                        composable("home") {
                            val sharedPrefs = getSharedPreferences("lansync_prefs", Context.MODE_PRIVATE)
                            val savedName = sharedPrefs.getString("device_name", android.os.Build.MODEL) ?: android.os.Build.MODEL
                            try { Bridge.setDeviceName(savedName) } catch (e: Exception) {}

                            HomeScreen(
                                deviceName = savedName,
                                isNetworkAvailable = isNetworkAvailable.value,
                                localIP = getLocalIPAddress() ?: "127.0.0.1",
                                activeDeviceIP = activeDeviceIP.value,
                                activeDeviceOS = activeDeviceOS.value,
                                recentDevices = recentDevicesState.value,
                                isConnecting = isConnecting.value,
                                onConnect = { ip, onSuccess ->
                                    connectToDevice(ip) { success ->
                                        if (success) activeDeviceIP.value = ip
                                        onSuccess(success) // Triggers the IP Field Reset!
                                    }
                                },
                                onDisconnect = {
                                    activeDeviceIP.value?.let { ip -> disconnectFromDevice(ip) }
                                    activeDeviceIP.value = null
                                },
                                onRemoveRecentDevice = { ipToRemove ->
                                    prefsManager.removeDevice(ipToRemove)
                                    recentDevicesState.value = prefsManager.getRecentDevices()
                                    Toast.makeText(this@MainActivity, "Device removed", Toast.LENGTH_SHORT).show()
                                }
                            )
                        }
                        composable("browse") {
                            LaunchedEffect(activeDeviceIP.value) {
                                activeDeviceIP.value?.let { ip -> fetchRemoteFiles(ip, currentPath.value) }
                            }

                            val activeDeviceName = recentDevicesState.value.find { it.ip == activeDeviceIP.value }?.name ?: "Connected Device"

                            BrowseScreen(
                                activeDeviceIP = activeDeviceIP.value,
                                activeDeviceOS = activeDeviceOS.value,
                                activeDeviceName = activeDeviceName,
                                currentPath = currentPath.value,
                                parentPath = parentPath.value,
                                files = remoteFiles.value,
                                isLoading = isLoadingFiles.value,
                                onNavigate = { newPath -> activeDeviceIP.value?.let { ip -> fetchRemoteFiles(ip, newPath) } },
                                onShareClipboardClick = { activeDeviceIP.value?.let { ip -> shareMobileTextWithDesktop(ip, "34931") } },
                                onCreateFolder = { folderName ->
                                    activeDeviceIP.value?.let { ip -> createRemoteFolder(ip, currentPath.value, folderName) }
                                },
                                onUploadFiles = { uris ->
                                    activeDeviceIP.value?.let { ip -> uploadFilesToDesktop(ip, currentPath.value, uris) }
                                },
                                onUploadFolder = { treeUri -> activeDeviceIP.value?.let { ip -> uploadFolderToDesktop(ip, currentPath.value, treeUri) } },
                                onDownloadFiles = { selectedFiles ->
                                    activeDeviceIP.value?.let { ip -> downloadFilesFromDesktop(ip, selectedFiles) }
                                },
                                onRefresh = {
                                    activeDeviceIP.value?.let { ip -> fetchRemoteFiles(ip, currentPath.value) }
                                }
                            )
                        }
                        composable("settings") {
                            val sharedPrefs = getSharedPreferences("lansync_prefs", Context.MODE_PRIVATE)
                            val savedName = sharedPrefs.getString("device_name", android.os.Build.MODEL) ?: android.os.Build.MODEL
                            val savedDownloadUri = sharedPrefs.getString("download_folder", "") ?: ""
                            val savedExposedUri = sharedPrefs.getString("exposed_folder", "") ?: ""

                            com.xrontrix.lansync.ui.screens.SettingsScreen(
                                currentDeviceName = savedName,
                                currentDownloadFolderUri = savedDownloadUri,
                                currentExposedFolderUri = savedExposedUri,
                                onSaveName = { name ->
                                    sharedPrefs.edit { putString("device_name", name) }
                                    try { Bridge.setDeviceName(name) } catch (e: Exception) {}
                                    Toast.makeText(this@MainActivity, "Name saved!", Toast.LENGTH_SHORT).show()
                                },
                                onUpdateDownloadFolder = { downloadUri ->
                                    sharedPrefs.edit { putString("download_folder", downloadUri) }
                                    try {
                                        contentResolver.takePersistableUriPermission(downloadUri.toUri(), Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                                    } catch (e: Exception) { e.printStackTrace() }
                                    Toast.makeText(this@MainActivity, "Download folder updated!", Toast.LENGTH_SHORT).show()
                                },
                                onUpdateExposedFolder = { exposedUri ->
                                    sharedPrefs.edit { putString("exposed_folder", exposedUri) }
                                    try { Bridge.updateExposedDir(getRealPathFromURI(exposedUri)) } catch (e: Exception) {}
                                    try {
                                        contentResolver.takePersistableUriPermission(exposedUri.toUri(), Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                                    } catch (e: Exception) { e.printStackTrace() }
                                    Toast.makeText(this@MainActivity, "Exposed folder updated!", Toast.LENGTH_SHORT).show()
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    private fun getLocalIPAddress(): String? {
        try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val intf = interfaces.nextElement()
                val addrs = intf.inetAddresses
                while (addrs.hasMoreElements()) {
                    val addr = addrs.nextElement()
                    if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
                        return addr.hostAddress
                    }
                }
            }
        } catch (ex: Exception) { }
        return null
    }

    private fun connectToDevice(ip: String, onResult: (Boolean) -> Unit) {
        isConnecting.value = true
        Toast.makeText(this, "Asking to connect...", Toast.LENGTH_SHORT).show()

        Thread {
            try {
                val identity = fetchDeviceIdentity(ip)
                val os = identity?.second ?: "windows"

                val connectedDeviceName = Bridge.requestConnection(ip, "34931")

                runOnUiThread {
                    isConnecting.value = false
                    if (connectedDeviceName.isNotEmpty()) {
                        activeDeviceOS.value = os // Save it to state!
                        prefsManager.saveRecentDevice(ip, connectedDeviceName)
                        recentDevicesState.value = prefsManager.getRecentDevices()
                        toggleForegroundService(true) // Start the Foreground Service!
                        Toast.makeText(this, "Connected securely!", Toast.LENGTH_SHORT).show()
                        onResult(true)
                    } else {
                        Toast.makeText(this, "Connection declined", Toast.LENGTH_SHORT).show()
                        onResult(false)
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    isConnecting.value = false
                    Toast.makeText(this, "Failed: ${e.message}", Toast.LENGTH_SHORT).show()
                    onResult(false)
                }
            }
        }.start()
    }

    private fun disconnectFromDevice(ip: String) {
        try { Bridge.disconnectDevice(ip) } catch (e: Exception) { e.printStackTrace() }
        Toast.makeText(this, "Disconnected", Toast.LENGTH_SHORT).show()
    }

    override fun onClipboardDataReceived(data: ByteArray?, contentType: String?) {
        if (data != null && contentType?.startsWith("text/") == true) {
            val text = String(data, Charsets.UTF_8)
            val clipboardManager = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            runOnUiThread {
                clipboardManager.setPrimaryClip(android.content.ClipData.newPlainText("LanSync", text))
                Toast.makeText(this@MainActivity, "Desktop text copied!", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun fetchRemoteFiles(ip: String, path: String) {
        isLoadingFiles.value = true
        Thread {
            try {
                val jsonString = Bridge.getRemoteFilesJson(ip, "34931", path)
                val jsonObject = JSONObject(jsonString)
                val newCurrentPath = jsonObject.optString("path", "/")
                val newParentPath = jsonObject.optString("parent", "")
                val filesArray: JSONArray? = jsonObject.optJSONArray("files")

                val parsedFiles = mutableListOf<com.xrontrix.lansync.ui.screens.FileInfo>()
                if (filesArray != null) {
                    for (i in 0 until filesArray.length()) {
                        val f = filesArray.getJSONObject(i)
                        parsedFiles.add(
                            com.xrontrix.lansync.ui.screens.FileInfo(
                                name = f.getString("name"),
                                path = f.getString("path"),
                                size = f.optLong("size", 0),
                                isDir = f.getBoolean("isDir")
                            )
                        )
                    }
                }
                runOnUiThread {
                    currentPath.value = newCurrentPath
                    parentPath.value = newParentPath
                    remoteFiles.value = parsedFiles
                    isLoadingFiles.value = false
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Failed to load files: ${e.message}", Toast.LENGTH_SHORT).show()
                    isLoadingFiles.value = false
                }
            }
        }.start()
    }

    private fun shareMobileTextWithDesktop(targetIP: String, port: String) {
        val clipboardManager = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        if (!clipboardManager.hasPrimaryClip() || clipboardManager.primaryClip?.getItemAt(0)?.text == null) {
            runOnUiThread { Toast.makeText(this, "Mobile clipboard is empty", Toast.LENGTH_SHORT).show() }
            return
        }
        val text = clipboardManager.primaryClip!!.getItemAt(0).text.toString()
        Thread {
            try {
                Bridge.shareMobileClipboard(targetIP, port, text.toByteArray(Charsets.UTF_8), "text/plain")
                runOnUiThread { Toast.makeText(this@MainActivity, "Sent to Desktop!", Toast.LENGTH_SHORT).show() }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this@MainActivity, "Share failed: ${e.message}", Toast.LENGTH_LONG).show() }
            }
        }.start()
    }

    private fun createRemoteFolder(ip: String, currentPath: String, folderName: String) {
        Thread {
            try {
                Bridge.makeDirectory(ip, "34931", currentPath, folderName)
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Folder created!", Toast.LENGTH_SHORT).show()
                    fetchRemoteFiles(ip, currentPath)
                }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(this@MainActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show() }
            }
        }.start()
    }

    private fun uploadSingleFile(ip: String, token: String, remotePath: String, uri: Uri, fileName: String): Boolean {
        return try {
            val encodedPath = URLEncoder.encode(remotePath, "UTF-8")
            val url = URL("http://$ip:34931/api/files/upload?dir=$encodedPath")
            val connection = url.openConnection() as HttpURLConnection
            val boundary = "Boundary-${System.currentTimeMillis()}"

            connection.requestMethod = "POST"
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            connection.doOutput = true
            connection.setChunkedStreamingMode(1024 * 1024)

            DataOutputStream(connection.outputStream).use { outputStream ->
                outputStream.writeBytes("--$boundary\r\n")
                outputStream.writeBytes("Content-Disposition: form-data; name=\"files\"; filename=\"$fileName\"\r\n")
                outputStream.writeBytes("Content-Type: application/octet-stream\r\n\r\n")
                contentResolver.openInputStream(uri)?.use { it.copyTo(outputStream) }
                outputStream.writeBytes("\r\n--$boundary--\r\n")
                outputStream.flush()
            }
            val code = connection.responseCode
            connection.disconnect()
            code == 200
        } catch (e: Exception) { false }
    }

    private fun uploadFilesToDesktop(ip: String, currentPath: String, uris: List<Uri>) {
        val token = Bridge.getSessionToken(ip)
        if (token.isEmpty()) return
        isLoadingFiles.value = true

        Thread {
            var successCount = 0
            for (uri in uris) {
                var fileName = "upload.file"
                contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (cursor.moveToFirst() && nameIndex >= 0) fileName = cursor.getString(nameIndex)
                }
                if (uploadSingleFile(ip, token, currentPath, uri, fileName)) successCount++
            }
            runOnUiThread {
                Toast.makeText(this@MainActivity, "Uploaded $successCount of ${uris.size} files", Toast.LENGTH_SHORT).show()
                fetchRemoteFiles(ip, currentPath)
            }
        }.start()
    }

    private fun uploadFolderToDesktop(ip: String, currentPath: String, treeUri: Uri) {
        val token = Bridge.getSessionToken(ip)
        if (token.isEmpty()) return
        isLoadingFiles.value = true

        Thread {
            try {
                val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))
                var rootFolderName = "UploadedFolder"

                contentResolver.query(DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri)), null, null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (nameIndex >= 0) rootFolderName = cursor.getString(nameIndex)
                    }
                }

                Bridge.makeDirectory(ip, "34931", currentPath, rootFolderName)
                val newRemoteBasePath = if (currentPath == "/") "/$rootFolderName" else "$currentPath/$rootFolderName"
                var successCount = 0

                fun traverse(uri: Uri, remotePath: String) {
                    contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                        val idIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        val mimeIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)

                        while (cursor.moveToNext()) {
                            val docId = cursor.getString(idIndex)
                            val name = cursor.getString(nameIndex)
                            val mime = cursor.getString(mimeIndex)

                            if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                                Bridge.makeDirectory(ip, "34931", remotePath, name)
                                val childUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId)
                                traverse(childUri, "$remotePath/$name")
                            } else {
                                val fileUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
                                if (uploadSingleFile(ip, token, remotePath, fileUri, name)) successCount++
                            }
                        }
                    }
                }

                traverse(childrenUri, newRemoteBasePath)

                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Uploaded $successCount files from folder", Toast.LENGTH_SHORT).show()
                    fetchRemoteFiles(ip, currentPath)
                }
            } catch (e: Exception) {
                e.printStackTrace()
                runOnUiThread { Toast.makeText(this@MainActivity, "Folder upload failed", Toast.LENGTH_SHORT).show() }
            } finally {
                runOnUiThread { isLoadingFiles.value = false }
            }
        }.start()
    }

    private fun downloadFilesFromDesktop(ip: String, files: List<com.xrontrix.lansync.ui.screens.FileInfo>) {
        val token = Bridge.getSessionToken(ip)
        if (token.isEmpty()) return

        val downloadManager = getSystemService(Context.DOWNLOAD_SERVICE) as android.app.DownloadManager
        var startedCount = 0

        for (file in files) {
            try {
                val encodedPath = java.net.URLEncoder.encode(file.path, "UTF-8")
                val url = "http://$ip:34931/api/files/download?path=$encodedPath"

                val request = android.app.DownloadManager.Request(url.toUri())
                    .setTitle(file.name)
                    .setDescription("Downloading via LanSync")
                    .setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, "LanSync/${file.name}")
                    .addRequestHeader("Authorization", "Bearer $token")

                downloadManager.enqueue(request)
                startedCount++
            } catch (e: Exception) { e.printStackTrace() }
        }
        Toast.makeText(this, "Started $startedCount download(s)", Toast.LENGTH_SHORT).show()
    }

    private fun checkAndRequestStoragePermissions() {
        // 1. Request All Files Access (Your existing code)
        if (!android.os.Environment.isExternalStorageManager()) {
            try {
                val intent = android.content.Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                intent.data = Uri.fromParts("package", packageName, null)
                startActivity(intent)
            } catch (e: Exception) {
                startActivity(android.content.Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            }
        }

        // 2. Request Notification Permission for Android 13+ (Tiramisu)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }
    }

    private fun getRealPathFromURI(uriString: String): String {
        val defaultPath = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS).absolutePath + "/LanSync"
        if (uriString.isBlank()) return defaultPath
        return try {
            val decoded = java.net.URLDecoder.decode(uriString, "UTF-8")
            if (decoded.contains("primary:")) {
                val path = decoded.substringAfterLast("primary:")
                "/storage/emulated/0/$path"
            } else defaultPath
        } catch (e: Exception) { defaultPath }
    }

    private fun fetchDeviceIdentity(ip: String): Pair<String, String>? {
        return try {
            val url = URL("http://$ip:34931/api/identify")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 2000
            connection.readTimeout = 2000
            val response = connection.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(response)
            Pair(json.optString("deviceName", "Unknown"), json.optString("os", "windows"))
        } catch (e: Exception) { null }
    }

    override fun onConnectionRequested(ip: String?, deviceName: String?) {
        if (ip == null || deviceName == null) return
        Thread {
            val identity = fetchDeviceIdentity(ip)
            val os = identity?.second ?: "windows"
            runOnUiThread {
                incomingRequest.value = Triple(ip, deviceName, os)
            }
        }.start()
    }

    override fun onDeviceDropped(ip: String?) {
        runOnUiThread {
            if (activeDeviceIP.value == ip) {
                activeDeviceIP.value = null
                toggleForegroundService(false) // Stop the Foreground Service!
            }
            Toast.makeText(this, "Device disconnected: $ip", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        connectivityManager.unregisterNetworkCallback(networkCallback)
        Bridge.shutdown()
    }
}