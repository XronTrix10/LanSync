package com.xrontrix.lansync.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.SnippetFolder
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xrontrix.lansync.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    currentDeviceName: String,
    currentDownloadFolderUri: String,
    currentExposedFolderUri: String,
    onSaveName: (String) -> Unit,
    onUpdateDownloadFolder: (String) -> Unit,
    onUpdateExposedFolder: (String) -> Unit
) {
    var deviceName by remember { mutableStateOf(currentDeviceName) }

    // ── Local states so the UI updates the millisecond you click ──
    var downloadFolderUri by remember { mutableStateOf(currentDownloadFolderUri) }
    var exposedFolderUri by remember { mutableStateOf(currentExposedFolderUri) }

    val downloadPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            downloadFolderUri = uri.toString()
            onUpdateDownloadFolder(uri.toString())
        }
    }

    val exposedPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            exposedFolderUri = uri.toString()
            onUpdateExposedFolder(uri.toString())
        }
    }

    fun formatUriDisplay(uri: String): String {
        if (uri == "ROOT") return "Entire Device Storage"
        if (uri.isBlank()) return "Default (Downloads/LanSync)"
        return try {
            val decoded = java.net.URLDecoder.decode(uri, "UTF-8")
            if (decoded.contains("primary:")) {
                "/" + decoded.substringAfterLast("primary:")
            } else {
                "Custom Folder Selected"
            }
        } catch (e: Exception) {
            "Custom Folder Selected"
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(20.dp)) {
        Text("Settings", color = TextPrimary, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Spacer(modifier = Modifier.height(24.dp))

        // ── DEVICE NAME SECTION ──
        Surface(
            color = Panel, shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, Surface),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text("DEVICE NAME", color = TextMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = deviceName,
                    onValueChange = { deviceName = it },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Accent, unfocusedBorderColor = BgBase,
                        focusedContainerColor = BgBase, unfocusedContainerColor = BgBase,
                        focusedTextColor = TextPrimary, unfocusedTextColor = TextPrimary
                    ),
                    singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = { onSaveName(deviceName) },
                    colors = ButtonDefaults.buttonColors(containerColor = Accent.copy(alpha = 0.15f), contentColor = Accent),
                    modifier = Modifier.fillMaxWidth().height(45.dp), shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Filled.Save, contentDescription = "Save", modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Save", fontWeight = FontWeight.Bold)
                }
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        Text("DIRECTORIES", color = TextMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        Spacer(modifier = Modifier.height(12.dp))

        // ── DOWNLOAD FOLDER ──
        Surface(
            color = Panel, shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, Surface),
            modifier = Modifier.fillMaxWidth(), onClick = { downloadPicker.launch(null) }
        ) {
            Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Folder, contentDescription = null, tint = Accent)
                Spacer(modifier = Modifier.width(16.dp))
                Column {
                    Text("Download Folder", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Text(formatUriDisplay(downloadFolderUri), color = TextMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // ── EXPOSED FOLDER & SHARE ROOT ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Surface(
                color = Panel, shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, Surface),
                modifier = Modifier.weight(1f), onClick = { exposedPicker.launch(null) }
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Icon(Icons.Filled.Folder, contentDescription = null, tint = GreenAccent)
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("Exposed Folder", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = if (exposedFolderUri != "ROOT") formatUriDisplay(exposedFolderUri) else "Not active",
                        color = TextMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Surface(
                color = Panel, shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, Surface),
                modifier = Modifier.weight(1f),
                onClick = {
                    exposedFolderUri = "ROOT"
                    onUpdateExposedFolder("ROOT")
                }
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Icon(Icons.Filled.SnippetFolder, contentDescription = null, tint = RedAccent)
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("Share Root", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = if (exposedFolderUri == "ROOT") "Currently Active" else "Entire Device",
                        color = if (exposedFolderUri == "ROOT") RedAccent else TextMuted,
                        fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}