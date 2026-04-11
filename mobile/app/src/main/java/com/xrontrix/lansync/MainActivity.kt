package com.xrontrix.lansync

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkRequest
import android.net.Uri
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

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()
    private lateinit var connectivityManager: ConnectivityManager

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { 
            val ip = getLocalIPAddress()
            viewModel.currentLocalIP.value = ip
            viewModel.isNetworkAvailable.value = ip != null
            if (ip != null) {
                try { Bridge.updateLocalIP(ip) } catch (e: Exception) {}
            }
        }
        override fun onLost(network: Network) { 
            val ip = getLocalIPAddress()
            viewModel.currentLocalIP.value = ip
            viewModel.isNetworkAvailable.value = ip != null
            try { Bridge.updateLocalIP(ip ?: "") } catch (e: Exception) {}
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        checkAndRequestStoragePermissions()

        val prefsManager = PreferencesManager(this)
        val transferManager = FileTransferManager(this)
        viewModel.initialize(prefsManager, transferManager)

        viewModel.onToggleForegroundService = { start ->
            val serviceIntent = Intent(this, LanSyncService::class.java)
            if (start) {
                startForegroundService(serviceIntent)
            } else {
                stopService(serviceIntent)
            }
        }

        setupNetworkMonitoring()
        Bridge.startupWithCallback(viewModel)

        val sharedPrefs = getSharedPreferences("lansync_prefs", Context.MODE_PRIVATE)
        val savedName = sharedPrefs.getString("device_name", android.os.Build.MODEL) ?: android.os.Build.MODEL
        try { Bridge.setDeviceName(savedName) } catch (e: Exception) {}

        val exposedUri = sharedPrefs.getString("exposed_folder", "") ?: ""
        if (exposedUri == "ROOT") {
            try { Bridge.updateExposedDir("ROOT") } catch (e: Exception) {}
        } else if (exposedUri.isNotBlank()) {
            try { Bridge.updateExposedDir(getRealPathFromURI(exposedUri)) } catch (e: Exception) {}
        }

        val savedDownloadUri = sharedPrefs.getString("download_folder", "") ?: ""
        if (savedDownloadUri.isNotBlank()) {
            try { Bridge.updateDownloadDir(getRealPathFromURI(savedDownloadUri)) } catch (e: Exception) {}
        }

        try { Bridge.startMobileServer() } catch (e: Exception) { e.printStackTrace() }

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
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val request = NetworkRequest.Builder().build()
        connectivityManager.registerNetworkCallback(request, networkCallback)

        val ip = getLocalIPAddress()
        viewModel.currentLocalIP.value = ip
        viewModel.isNetworkAvailable.value = ip != null

        if (ip != null) {
            try { Bridge.updateLocalIP(ip) } catch (e: Exception) {}
        }
    }

    private fun checkAndRequestStoragePermissions() {
        if (!android.os.Environment.isExternalStorageManager()) {
            try {
                val intent = Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                intent.data = Uri.fromParts("package", packageName, null)
                startActivity(intent)
            } catch (e: Exception) {
                startActivity(Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            }
        }

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }
    }

    private fun getRealPathFromURI(uriString: String): String {
        if (uriString == "ROOT") {
            return android.os.Environment.getExternalStorageDirectory().absolutePath
        }
        val defaultPath = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS).absolutePath + "/LANSync"
        if (uriString.isBlank()) return defaultPath
        return try {
            val decoded = java.net.URLDecoder.decode(uriString, "UTF-8")
            if (decoded.contains("primary:")) {
                val path = decoded.substringAfterLast("primary:")
                "/storage/emulated/0/$path"
            } else defaultPath
        } catch (e: Exception) { defaultPath }
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
                        val ip = addr.hostAddress
                        if (ip != null && (ip.startsWith("10.") || ip.startsWith("172.") || ip.startsWith("192.168."))) {
                            return ip
                        }
                    }
                }
            }
        } catch (ex: Exception) { }
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        connectivityManager.unregisterNetworkCallback(networkCallback)
        Bridge.shutdown()
    }
}