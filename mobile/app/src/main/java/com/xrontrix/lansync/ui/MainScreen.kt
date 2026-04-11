package com.xrontrix.lansync.ui

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.edit
import androidx.core.net.toUri
import androidx.navigation.compose.*
import bridge.Bridge
import com.xrontrix.lansync.R
import com.xrontrix.lansync.ui.screens.BrowseScreen
import com.xrontrix.lansync.ui.screens.HomeScreen
import com.xrontrix.lansync.ui.screens.SettingsScreen
import com.xrontrix.lansync.ui.theme.*
import com.xrontrix.lansync.viewmodel.MainViewModel

@Composable
fun MainScreen(
    viewModel: MainViewModel,
    onRefreshNetwork: () -> Unit,
    getRealPathFromURI: (String) -> String
) {
    val context = LocalContext.current
    val navController = rememberNavController()

    val req = viewModel.incomingRequest.value
    if (req != null) {
        Dialog(
            onDismissRequest = { },
            properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false)
        ) {
            Box(
                modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)).padding(20.dp),
                contentAlignment = Alignment.Center
            ) {
                Surface(
                    shape = RoundedCornerShape(24.dp),
                    color = Panel,
                    border = BorderStroke(1.dp, Accent.copy(alpha = 0.3f)),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Accent.copy(alpha = 0.1f),
                            border = BorderStroke(1.dp, Accent.copy(alpha = 0.2f)),
                            modifier = Modifier.size(64.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(painter = painterResource(id = R.drawable.filled_security), contentDescription = null, tint = Accent, modifier = Modifier.size(28.dp))
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
                                onClick = { viewModel.rejectIncomingConnection() },
                                color = RedAccent.copy(alpha = 0.1f),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f).height(45.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) { Text("Reject", color = RedAccent, fontWeight = FontWeight.SemiBold, fontSize = 14.sp) }
                            }

                            Surface(
                                onClick = { viewModel.acceptIncomingConnection() },
                                color = LightAccent.copy(alpha = 0.1f),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f).height(45.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) { Text("Accept", color = LightAccent, fontWeight = FontWeight.SemiBold, fontSize = 14.sp) }
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
                val sharedPrefs = context.getSharedPreferences("lansync_prefs", Context.MODE_PRIVATE)
                val savedName = sharedPrefs.getString("device_name", android.os.Build.MODEL) ?: android.os.Build.MODEL
                try { Bridge.setDeviceName(savedName) } catch (e: Exception) {}

                HomeScreen(
                    deviceName = savedName,
                    isNetworkAvailable = viewModel.isNetworkAvailable.value,
                    localIP = viewModel.currentLocalIP.value ?: "127.0.0.1",
                    activeDeviceIP = viewModel.activeDeviceIP.value,
                    activeDeviceOS = viewModel.activeDeviceOS.value,
                    recentDevices = viewModel.recentDevicesState.value,
                    discoveredDevices = viewModel.discoveredDevices.value,
                    isConnecting = viewModel.isConnecting.value,
                    clearIPInputTrigger = viewModel.clearIPInputTrigger.value,
                    onConnect = { ip -> viewModel.connectToDevice(ip) {} },
                    onDisconnect = {
                        viewModel.activeDeviceIP.value?.let { ip -> viewModel.disconnectFromDevice(ip) }
                    },
                    onRemoveRecentDevice = { ipToRemove ->
                        viewModel.removeRecentDevice(ipToRemove)
                    },
                    onRefreshNetwork = onRefreshNetwork
                )
            }
            composable("browse") {
                LaunchedEffect(viewModel.activeDeviceIP.value) {
                    viewModel.activeDeviceIP.value?.let { ip -> viewModel.fetchRemoteFiles(ip, viewModel.currentPath.value) }
                }

                val activeDeviceName = viewModel.recentDevicesState.value.find { it.ip == viewModel.activeDeviceIP.value }?.name ?: "Connected Device"

                BrowseScreen(
                    activeDeviceIP = viewModel.activeDeviceIP.value,
                    activeDeviceOS = viewModel.activeDeviceOS.value,
                    activeDeviceName = activeDeviceName,
                    currentPath = viewModel.currentPath.value,
                    parentPath = viewModel.parentPath.value,
                    files = viewModel.remoteFiles.value,
                    isLoading = viewModel.isLoadingFiles.value,
                    onNavigate = { newPath -> viewModel.activeDeviceIP.value?.let { ip -> viewModel.fetchRemoteFiles(ip, newPath) } },
                    onShareClipboardClick = { viewModel.activeDeviceIP.value?.let { ip -> viewModel.shareMobileTextWithDesktop(ip) } },
                    onCreateFolder = { folderName ->
                        viewModel.activeDeviceIP.value?.let { ip -> viewModel.createRemoteFolder(ip, viewModel.currentPath.value, folderName) }
                    },
                    onUploadFiles = { uris ->
                        viewModel.activeDeviceIP.value?.let { ip ->
                            viewModel.uploadFiles(ip, viewModel.currentPath.value, uris)
                        }
                    },
                    onUploadFolder = { treeUri ->
                        viewModel.activeDeviceIP.value?.let { ip ->
                            viewModel.uploadFolder(ip, viewModel.currentPath.value, treeUri)
                        }
                    },
                    onDownloadFiles = { selectedFiles ->
                        viewModel.activeDeviceIP.value?.let { ip ->
                            viewModel.downloadFiles(ip, selectedFiles.toList())
                        }
                    },
                    onRefresh = {
                        viewModel.activeDeviceIP.value?.let { ip -> viewModel.fetchRemoteFiles(ip, viewModel.currentPath.value) }
                    }
                )
            }
            composable("settings") {
                val sharedPrefs = context.getSharedPreferences("lansync_prefs", Context.MODE_PRIVATE)
                val savedName = sharedPrefs.getString("device_name", android.os.Build.MODEL) ?: android.os.Build.MODEL
                val savedDownloadUri = sharedPrefs.getString("download_folder", "") ?: ""
                val savedExposedUri = sharedPrefs.getString("exposed_folder", "") ?: ""

                SettingsScreen(
                    currentDeviceName = savedName,
                    currentDownloadFolderUri = savedDownloadUri,
                    currentExposedFolderUri = savedExposedUri,
                    onSaveName = { name ->
                        sharedPrefs.edit { putString("device_name", name) }
                        try { Bridge.setDeviceName(name) } catch (e: Exception) {}
                        Toast.makeText(context, "Saved changes!", Toast.LENGTH_SHORT).show()
                    },
                    onUpdateDownloadFolder = { downloadUri ->
                        sharedPrefs.edit { putString("download_folder", downloadUri) }
                        try { Bridge.updateDownloadDir(getRealPathFromURI(downloadUri)) } catch (e: Exception) {}

                        try {
                            context.contentResolver.takePersistableUriPermission(
                                downloadUri.toUri(),
                                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                            )
                        } catch (e: Exception) { e.printStackTrace() }
                        Toast.makeText(context, "Changed download folder", Toast.LENGTH_SHORT).show()
                    },
                    onUpdateExposedFolder = { exposedUri ->
                        sharedPrefs.edit { putString("exposed_folder", exposedUri) }

                        if (exposedUri == "ROOT") {
                            try { Bridge.updateExposedDir("ROOT") } catch (e: Exception) {}
                        } else {
                            try { Bridge.updateExposedDir(getRealPathFromURI(exposedUri)) } catch (e: Exception) {}
                            try {
                                context.contentResolver.takePersistableUriPermission(
                                    exposedUri.toUri(),
                                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                                )
                            } catch (e: Exception) { e.printStackTrace() }
                        }
                        Toast.makeText(context, "Changed exposed folder", Toast.LENGTH_SHORT).show()
                    }
                )
            }
        }
    }
}
