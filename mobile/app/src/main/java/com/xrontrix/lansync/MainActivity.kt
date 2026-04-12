package com.xrontrix.lansync

import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkRequest
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import bridge.Bridge
import com.xrontrix.lansync.data.PreferencesManager
import com.xrontrix.lansync.network.FileTransferManager
import com.xrontrix.lansync.ui.MainScreen
import com.xrontrix.lansync.ui.theme.LansyncTheme
import com.xrontrix.lansync.viewmodel.MainViewModel
import java.net.Inet4Address
import java.net.NetworkInterface

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()
    private lateinit var connectivityManager: ConnectivityManager

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            val ip = getLocalIPAddress()
            viewModel.currentLocalIP.value = ip
            viewModel.isNetworkAvailable.value = ip != null
            if (ip != null) {
                runCatching { Bridge.updateLocalIP(ip) }
            }
        }
        override fun onLost(network: Network) {
            val ip = getLocalIPAddress()
            viewModel.currentLocalIP.value = ip
            viewModel.isNetworkAvailable.value = ip != null
            runCatching { Bridge.updateLocalIP(ip ?: "") }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        checkAndRequestStoragePermissions()

        val prefsManager = PreferencesManager(this)
        val transferManager = FileTransferManager(this)
        viewModel.initialize(prefsManager, transferManager)

        viewModel.onToggleForegroundService = { start ->
            val serviceIntent = Intent(this, LANSyncService::class.java)
            if (start) {
                startForegroundService(serviceIntent)
            } else {
                stopService(serviceIntent)
            }
        }

        setupNetworkMonitoring()
        Bridge.startupWithCallback(viewModel)

        val sharedPrefs = getSharedPreferences("lansync_prefs", MODE_PRIVATE)
        val savedName = sharedPrefs.getString("device_name", Build.MODEL) ?: Build.MODEL
        runCatching { Bridge.setDeviceName(savedName) }

        val exposedUri = sharedPrefs.getString("exposed_folder", "") ?: ""
        if (exposedUri == "ROOT") {
            runCatching { Bridge.updateExposedDir("ROOT") }
        } else if (exposedUri.isNotBlank()) {
            runCatching { Bridge.updateExposedDir(getRealPathFromURI(exposedUri)) }
        }

        val savedDownloadUri = sharedPrefs.getString("download_folder", "") ?: ""
        if (savedDownloadUri.isNotBlank()) {
            runCatching { Bridge.updateDownloadDir(getRealPathFromURI(savedDownloadUri)) }
        }

        runCatching { Bridge.startMobileServer() }.onFailure { it.printStackTrace() }

        setContent {
            LansyncTheme {
                MainScreen(
                    viewModel = viewModel,
                    onRefreshNetwork = {
                        val ip = getLocalIPAddress()
                        viewModel.currentLocalIP.value = ip
                        viewModel.isNetworkAvailable.value = ip != null
                        Toast.makeText(this@MainActivity, "Network refreshed", Toast.LENGTH_SHORT).show()
                    },
                    getRealPathFromURI = { uriString -> getRealPathFromURI(uriString) }
                )
            }
        }
    }

    private fun setupNetworkMonitoring() {
        connectivityManager = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val request = NetworkRequest.Builder().build()
        connectivityManager.registerNetworkCallback(request, networkCallback)

        val ip = getLocalIPAddress()
        viewModel.currentLocalIP.value = ip
        viewModel.isNetworkAvailable.value = ip != null

        if (ip != null) {
            runCatching { Bridge.updateLocalIP(ip) }
        }
    }

    private fun checkAndRequestStoragePermissions() {
        if (!android.os.Environment.isExternalStorageManager()) {
            runCatching {
                val intent = Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                intent.data = Uri.fromParts("package", packageName, null)
                startActivity(intent)
            }.onFailure {
                startActivity(Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }
    }

    private fun getRealPathFromURI(uriString: String): String {
        if (uriString == "ROOT") {
            return android.os.Environment.getExternalStorageDirectory().absolutePath
        }
        val defaultPath = android.os.Environment.getExternalStoragePublicDirectory(
            android.os.Environment.DIRECTORY_DOWNLOADS
        ).absolutePath + "/LANSync"
        if (uriString.isBlank()) return defaultPath
        return runCatching {
            val decoded = java.net.URLDecoder.decode(uriString, "UTF-8")
            if (decoded.contains("primary:")) {
                "/storage/emulated/0/${decoded.substringAfterLast("primary:")}"
            } else defaultPath
        }.getOrDefault(defaultPath)
    }

    private fun getLocalIPAddress(): String? {
        runCatching {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val networkInterface = interfaces.nextElement()
                val addresses = networkInterface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val address = addresses.nextElement()
                    if (!address.isLoopbackAddress && address is Inet4Address) {
                        val ip = address.hostAddress
                        if (ip != null && (ip.startsWith("10.") || ip.startsWith("172.") || ip.startsWith("192.168."))) {
                            return ip
                        }
                    }
                }
            }
        }
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        connectivityManager.unregisterNetworkCallback(networkCallback)
        Bridge.shutdown()
    }
}