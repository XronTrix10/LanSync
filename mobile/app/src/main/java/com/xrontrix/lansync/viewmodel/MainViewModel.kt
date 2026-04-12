package com.xrontrix.lansync.viewmodel

import android.app.Application
import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.AndroidViewModel
import bridge.Bridge
import bridge.BridgeCallback
import com.xrontrix.lansync.data.PreferencesManager
import com.xrontrix.lansync.data.RecentDevice
import com.xrontrix.lansync.network.FileTransferManager
import com.xrontrix.lansync.ui.screens.FileInfo
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class DiscoveredDevice(
    val ip: String,
    val deviceName: String,
    val os: String
)

class MainViewModel(application: Application) : AndroidViewModel(application), BridgeCallback {

    private val context: Context
        get() = getApplication<Application>().applicationContext

    private fun runOnUiThread(action: () -> Unit) {
        Handler(Looper.getMainLooper()).post(action)
    }

    val isNetworkAvailable = mutableStateOf(false)
    val currentLocalIP = mutableStateOf<String?>(null)
    
    val activeDeviceIP = mutableStateOf<String?>(null)
    val isConnecting = mutableStateOf(false)
    val activeDeviceOS = mutableStateOf("windows")
    val incomingRequest = mutableStateOf<Triple<String, String, String>?>(null)

    val recentDevicesState = mutableStateOf<List<RecentDevice>>(emptyList())
    val currentPath = mutableStateOf("/")
    val parentPath = mutableStateOf("")
    val remoteFiles = mutableStateOf<List<FileInfo>>(emptyList())
    val isLoadingFiles = mutableStateOf(false)
    val discoveredDevices = mutableStateOf<List<DiscoveredDevice>>(emptyList())
    val clearIPInputTrigger = mutableIntStateOf(0)

    private lateinit var prefsManager: PreferencesManager
    private lateinit var transferManager: FileTransferManager

    var onToggleForegroundService: ((Boolean) -> Unit)? = null

    fun initialize(prefs: PreferencesManager, transfer: FileTransferManager) {
        prefsManager = prefs
        transferManager = transfer
        recentDevicesState.value = prefsManager.getRecentDevices()
    }

    fun removeRecentDevice(ip: String) {
        prefsManager.removeDevice(ip)
        recentDevicesState.value = prefsManager.getRecentDevices()
        Toast.makeText(context, "Device removed", Toast.LENGTH_SHORT).show()
    }

    fun connectToDevice(ip: String, onResult: (Boolean) -> Unit) {
        isConnecting.value = true
        Toast.makeText(context, "Asking to connect...", Toast.LENGTH_SHORT).show()

        Thread {
            try {
                val identity = fetchDeviceIdentity(ip)
                val os = identity?.second ?: "windows"

                val connectedDeviceName = Bridge.requestConnection(ip, "34931")

                runOnUiThread {
                    isConnecting.value = false
                    if (connectedDeviceName.isNotEmpty()) {
                        activeDeviceOS.value = os
                        activeDeviceIP.value = ip
                        prefsManager.saveRecentDevice(ip, connectedDeviceName)
                        recentDevicesState.value = prefsManager.getRecentDevices()
                        onToggleForegroundService?.invoke(true)
                        clearIPInputTrigger.intValue++
                        Toast.makeText(context, "Connected securely!", Toast.LENGTH_SHORT).show()
                        onResult(true)
                    } else {
                        Toast.makeText(context, "Connection declined", Toast.LENGTH_SHORT).show()
                        onResult(false)
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    isConnecting.value = false
                    Toast.makeText(context, "Failed: ${e.message}", Toast.LENGTH_SHORT).show()
                    onResult(false)
                }
            }
        }.start()
    }

    fun disconnectFromDevice(ip: String) {
        try { Bridge.disconnectDevice(ip) } catch (e: Exception) { e.printStackTrace() }
        activeDeviceIP.value = null
        Toast.makeText(context, "Disconnected", Toast.LENGTH_SHORT).show()
    }

    fun fetchRemoteFiles(ip: String, path: String) {
        isLoadingFiles.value = true
        Thread {
            try {
                val jsonString = Bridge.getRemoteFilesJson(ip, "34931", path)
                val jsonObject = JSONObject(jsonString)
                val newCurrentPath = jsonObject.optString("path", "/")
                val newParentPath = jsonObject.optString("parent", "")
                val filesArray: JSONArray? = jsonObject.optJSONArray("files")

                val parsedFiles = mutableListOf<FileInfo>()
                if (filesArray != null) {
                    for (i in 0 until filesArray.length()) {
                        val f = filesArray.getJSONObject(i)
                        parsedFiles.add(
                            FileInfo(
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
                    Toast.makeText(context, "Failed to load files: ${e.message}", Toast.LENGTH_SHORT).show()
                    isLoadingFiles.value = false
                }
            }
        }.start()
    }

    fun shareMobileTextWithDesktop(targetIP: String) {
        val clipboardManager = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        if (!clipboardManager.hasPrimaryClip() || clipboardManager.primaryClip?.getItemAt(0)?.text == null) {
            runOnUiThread { Toast.makeText(context, "Mobile clipboard is empty", Toast.LENGTH_SHORT).show() }
            return
        }
        val text = clipboardManager.primaryClip!!.getItemAt(0).text.toString()
        Thread {
            try {
                Bridge.shareMobileClipboard(targetIP, "34931", text.toByteArray(Charsets.UTF_8), "text/plain")
                runOnUiThread { Toast.makeText(context, "Sent to Device!", Toast.LENGTH_SHORT).show() }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(context, "Share failed: ${e.message}", Toast.LENGTH_LONG).show() }
            }
        }.start()
    }

    fun createRemoteFolder(ip: String, currentPath: String, folderName: String) {
        Thread {
            try {
                Bridge.makeDirectory(ip, "34931", currentPath, folderName)
                runOnUiThread {
                    Toast.makeText(context, "Folder created!", Toast.LENGTH_SHORT).show()
                    fetchRemoteFiles(ip, currentPath)
                }
            } catch (e: Exception) {
                runOnUiThread { Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show() }
            }
        }.start()
    }

    fun uploadFiles(ip: String, path: String, uris: List<Uri>) {
        isLoadingFiles.value = true
        transferManager.uploadFiles(ip, path, uris) {
            fetchRemoteFiles(ip, path)
        }
    }

    fun uploadFolder(ip: String, path: String, treeUri: Uri) {
        isLoadingFiles.value = true
        transferManager.uploadFolder(ip, path, treeUri,
            onComplete = { fetchRemoteFiles(ip, path) },
            onError = { isLoadingFiles.value = false }
        )
    }

    fun downloadFiles(ip: String, selectedFiles: List<FileInfo>) {
        transferManager.downloadFiles(ip, selectedFiles)
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
        } catch (_: Exception) { null }
    }

    // BridgeCallback methods
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
                onToggleForegroundService?.invoke(false)
            }
            Toast.makeText(context, "Device disconnected: $ip", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDevicesDiscovered(jsonString: String?) {
        if (jsonString == null) return
        Thread {
            try {
                val jsonArray = JSONArray(jsonString)
                val devs = mutableListOf<DiscoveredDevice>()
                for (i in 0 until jsonArray.length()) {
                    val obj = jsonArray.getJSONObject(i)
                    devs.add(
                        DiscoveredDevice(
                            ip = obj.getString("ip"),
                            deviceName = obj.getString("deviceName"),
                            os = obj.getString("os")
                        )
                    )
                }
                val myIPs = currentLocalIP.value ?: ""
                val filteredDevs = devs.filter {
                    it.ip != myIPs &&
                            it.ip != "127.0.0.1" &&
                            !it.ip.startsWith("192.0.0.")
                }

                runOnUiThread {
                    discoveredDevices.value = filteredDevs
                }
            } catch (e: Exception) { e.printStackTrace() }
        }.start()
    }

    override fun onClipboardDataReceived(data: ByteArray?, contentType: String?) {
        if (data != null && contentType?.startsWith("text/") == true) {
            val text = String(data, Charsets.UTF_8)
            val clipboardManager = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            runOnUiThread {
                clipboardManager.setPrimaryClip(android.content.ClipData.newPlainText("LANSync", text))
                Toast.makeText(context, "Device text copied!", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun acceptIncomingConnection() {
        val req = incomingRequest.value ?: return
        Bridge.resolveConnection(req.first, true)
        activeDeviceIP.value = req.first
        prefsManager.saveRecentDevice(req.first, req.second)
        recentDevicesState.value = prefsManager.getRecentDevices()
        onToggleForegroundService?.invoke(true)
        incomingRequest.value = null
        Toast.makeText(context, "Connected to ${req.second}", Toast.LENGTH_SHORT).show()
    }

    fun rejectIncomingConnection() {
        val req = incomingRequest.value ?: return
        Bridge.resolveConnection(req.first, false)
        incomingRequest.value = null
    }
}
