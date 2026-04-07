package com.xrontrix.lansync.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.*
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.border
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xrontrix.lansync.ui.theme.*
import java.util.Locale
import kotlin.math.log10
import kotlin.math.pow
import androidx.activity.compose.BackHandler
import androidx.compose.material.icons.automirrored.rounded.InsertDriveFile
import androidx.compose.material.icons.automirrored.rounded.ListAlt
import androidx.compose.material.icons.rounded.*
import androidx.compose.ui.res.painterResource
import com.xrontrix.lansync.R

data class FileInfo(val name: String, val path: String, val size: Long, val isDir: Boolean)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrowseScreen(
    activeDeviceIP: String?,
    activeDeviceOS: String,
    activeDeviceName: String,
    currentPath: String,
    parentPath: String,
    files: List<FileInfo>,
    isLoading: Boolean,
    onNavigate: (String) -> Unit,
    onShareClipboardClick: () -> Unit,
    onUploadFiles: (List<Uri>) -> Unit,
    onUploadFolder: (Uri) -> Unit,
    onCreateFolder: (String) -> Unit,
    onDownloadFiles: (List<FileInfo>) -> Unit,
    onRefresh: () -> Unit
) {
    if (activeDeviceIP == null) {
        Box(modifier = Modifier.fillMaxSize().padding(20.dp), contentAlignment = Alignment.Center) {
            Card(
                colors = CardDefaults.cardColors(containerColor = RedAccent.copy(alpha = 0.1f)),
                border = BorderStroke(1.dp, RedAccent.copy(alpha = 0.3f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Filled.Computer, contentDescription = "No Device", tint = RedAccent, modifier = Modifier.size(48.dp))
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("No Device Connected", color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Please connect to a device to browse files.", color = TextMuted, textAlign = TextAlign.Center, fontSize = 14.sp)
                }
            }
        }
        return
    }

    var selectedFiles by remember { mutableStateOf(setOf<FileInfo>()) }
    var showCreateFolderDialog by remember { mutableStateOf(false) }
    var newFolderName by remember { mutableStateOf("") }
    var folderError by remember { mutableStateOf("") }
    var searchQuery by remember { mutableStateOf("") }
    var isSearchActive by remember { mutableStateOf(false) }

    BackHandler(enabled = currentPath != "/" && currentPath.isNotEmpty()) {
        onNavigate(parentPath.ifEmpty { "/" })
    }

    LaunchedEffect(currentPath) { 
        selectedFiles = emptySet() 
        searchQuery = ""
        isSearchActive = false
    }

    val displayFiles = remember(files, searchQuery) {
        if (searchQuery.isBlank()) {
            files
        } else {
            files.filter { it.name.contains(searchQuery, ignoreCase = true) }
        }
    }

    val filePickerLauncher = rememberLauncherForActivityResult(contract = ActivityResultContracts.GetMultipleContents()) { uris: List<Uri> ->
        if (uris.isNotEmpty()) onUploadFiles(uris)
    }

    val folderPickerLauncher = rememberLauncherForActivityResult(contract = ActivityResultContracts.OpenDocumentTree()) { uri: Uri? ->
        if (uri != null) onUploadFolder(uri)
    }

    if (showCreateFolderDialog) {
        androidx.compose.ui.window.Dialog(
            onDismissRequest = {
                showCreateFolderDialog = false
                newFolderName = ""
                folderError = ""
            },
            properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.6f))
                    .padding(20.dp),
                contentAlignment = Alignment.Center
            ) {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Panel,
                    border = BorderStroke(1.dp, Surface),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text("Create New Folder", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("Enter a name for the new folder", color = TextMuted, fontSize = 12.sp)

                        Spacer(modifier = Modifier.height(16.dp))

                        OutlinedTextField(
                            value = newFolderName,
                            onValueChange = {
                                newFolderName = it
                                folderError = "" // Clear error on typing
                            },
                            placeholder = { Text("Vacation Photos", color = TextMuted.copy(alpha = 0.5f), fontSize = 13.sp) },
                            singleLine = true,
                            textStyle = androidx.compose.ui.text.TextStyle(color = TextPrimary, fontSize = 14.sp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = GreenAccent,
                                unfocusedBorderColor = Surface,
                                focusedContainerColor = BgBase,
                                unfocusedContainerColor = BgBase,
                                focusedTextColor = TextPrimary,
                                unfocusedTextColor = TextPrimary
                            ),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        )

                        // ── DYNAMIC ERROR TEXT ──
                        if (folderError.isNotEmpty()) {
                            Text(folderError, color = RedAccent, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
                        }

                        Spacer(modifier = Modifier.height(24.dp))

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                            TextButton(
                                onClick = {
                                    showCreateFolderDialog = false
                                    newFolderName = ""
                                    folderError = ""
                                }
                            ) {
                                Text("Cancel", color = TextMuted, fontWeight = FontWeight.Medium)
                            }

                            Spacer(modifier = Modifier.width(8.dp))

                            Button(
                                onClick = {
                                    val trimmed = newFolderName.trim()
                                    if (trimmed.isEmpty()) return@Button

                                    // 1. Alphanumeric Check
                                    if (!trimmed.matches(Regex("^[a-zA-Z0-9 ]+$"))) {
                                        folderError = "Provide valid folder name (alphanumeric only)"
                                        return@Button
                                    }

                                    // 2. Duplicate Folder Check
                                    val exists = files.any { it.isDir && it.name.equals(trimmed, ignoreCase = true) }
                                    if (exists) {
                                        folderError = "Folder with this name already exists"
                                        return@Button
                                    }

                                    // 3. Success
                                    onCreateFolder(trimmed)
                                    newFolderName = ""
                                    folderError = ""
                                    showCreateFolderDialog = false
                                },
                                enabled = newFolderName.trim().isNotEmpty(),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = GreenAccent.copy(alpha = 0.1f),
                                    contentColor = GreenAccent,
                                    disabledContainerColor = GreenAccent.copy(alpha = 0.05f),
                                    disabledContentColor = GreenAccent.copy(alpha = 0.4f)
                                ),
                                border = BorderStroke(1.dp, if (newFolderName.trim().isNotEmpty()) GreenAccent.copy(alpha = 0.3f) else Color.Transparent),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.height(36.dp),
                                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 0.dp)
                            ) {
                                Text("Create", fontWeight = FontWeight.Medium, fontSize = 13.sp)
                            }
                        }
                    }
                }
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {

            Surface(color = BgBase, modifier = Modifier.fillMaxWidth()) {
                // ── DYNAMIC HEADER: Device Name OR Search Bar ──
                if (isSearchActive) {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        placeholder = { Text("Search files...", color = TextMuted) },
                        singleLine = true,
                        textStyle = androidx.compose.ui.text.TextStyle(color = TextPrimary, fontSize = 14.sp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = GreenAccent,
                            unfocusedBorderColor = Surface,
                            focusedContainerColor = Surface, // Darker inset look
                            unfocusedContainerColor = Surface,
                            focusedTextColor = TextPrimary
                        ),
                        modifier = Modifier.weight(1f).height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        trailingIcon = {
                            IconButton(
                                onClick = {
                                    if (searchQuery.isNotEmpty()) {
                                        searchQuery = "" // Clear input
                                    } else {
                                        isSearchActive = false // Close search
                                    }
                                }
                            ) {
                                Icon(Icons.Rounded.Close, contentDescription = "Close", tint = TextMuted)
                            }
                        }
                    )
                } else {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 16.dp), 
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        DeviceIcon(activeDeviceOS, GreenAccent, Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = activeDeviceName, 
                            color = TextPrimary, 
                            fontWeight = FontWeight.Black, 
                            fontSize = 18.sp, 
                            modifier = Modifier.weight(1f) // Pushes the button to the far right
                        )
                        
                        // ── Search Trigger Button ──
                        IconButton(
                            onClick = { isSearchActive = true },
                            modifier = Modifier
                                .size(36.dp)
                                .background(GreenAccent.copy(alpha = 0.1f), RoundedCornerShape(10.dp))
                                .border(1.dp, GreenAccent.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Search, 
                                contentDescription = "Search", 
                                tint = GreenAccent, // Matches the border/bg color theme
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }

            if (selectedFiles.isNotEmpty()) {
                Surface(color = Accent.copy(alpha = 0.1f), modifier = Modifier.fillMaxWidth()) {
                    Row(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { selectedFiles = emptySet() }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Filled.Close, contentDescription = "Clear", tint = TextPrimary)
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Text("${selectedFiles.size} selected", color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.weight(1f))
                    }
                }
            } else {
                Surface(color = Surface.copy(alpha = 0.5f), modifier = Modifier.fillMaxWidth()) {
                    Row(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Surface(color = Accent.copy(alpha = 0.15f), contentColor = Accent, shape = RoundedCornerShape(10.dp), modifier = Modifier.size(36.dp)) {
                            IconButton(onClick = { onNavigate(parentPath.ifEmpty { "/" }) }, enabled = currentPath != "/") {
                                Icon(Icons.Filled.ArrowUpward, contentDescription = "Up", modifier = Modifier.size(20.dp), tint = if (currentPath == "/") TextMuted.copy(alpha = 0.3f) else Accent)
                            }
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        // ── SMART BREADCRUMB FORMATTER ──
                        val displayPath = remember(currentPath) {
                            // 1. Squash any double slashes or stray Windows backslashes instantly
                            val cleanPath = currentPath.replace("\\", "/").replace(Regex("/{2,}"), "/")

                            if (cleanPath == "/" || cleanPath.isBlank()) {
                                "/"
                            } else {
                                // 2. Break it into perfect, empty-free segments
                                val segments = cleanPath.trim('/').split("/").filter { it.isNotEmpty() }
                                
                                if (segments.size > 3) {
                                    ".../" + segments.takeLast(3).joinToString("/")
                                } else {
                                    // Rebuild the string cleanly from segments instead of returning raw path ──
                                    "/" + segments.joinToString("/")
                                }
                            }
                        }

                        Text(
                            text = displayPath,
                            color = TextPrimary,
                            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                            fontSize = 14.sp,
                            modifier = Modifier.weight(1f),
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis // Ensures extremely long single folder names gracefully truncate
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Surface(color = Accent.copy(alpha = 0.15f), contentColor = Accent, shape = RoundedCornerShape(10.dp), modifier = Modifier.size(36.dp)) {
                            IconButton(onClick = onRefresh) { Icon(Icons.Filled.Refresh, contentDescription = "Refresh", modifier = Modifier.size(20.dp), tint = Accent) }
                        }
                    }
                }
            }
            HorizontalDivider(Modifier, DividerDefaults.Thickness, color = Panel)

            if (isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Accent)
                }
            } else if (displayFiles.isEmpty()) {
                // ── Centered "Modal" Empty State ──
                Box(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Surface.copy(alpha = 0.5f),
                        border = BorderStroke(1.dp, Panel),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(32.dp)
                        ) {
                            if (isSearchActive) {
                                // Empty Search State
                                Icon(Icons.Rounded.Search, contentDescription = null, modifier = Modifier.size(48.dp), tint = TextMuted.copy(alpha = 0.5f))
                                Spacer(modifier = Modifier.height(12.dp))
                                Text("No matching files found", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                            } else {
                                // Empty Folder State
                                Icon(Icons.Outlined.Folder, contentDescription = null, modifier = Modifier.size(48.dp), tint = Accent.copy(alpha = 0.5f))
                                Spacer(modifier = Modifier.height(12.dp))
                                Text("This folder is empty", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.height(4.dp))
                                Text("No files yet, upload some", color = TextMuted, fontSize = 13.sp)
                            }
                        }
                    }
                }
            } else {
                // ── Existing File List ──
                LazyColumn(contentPadding = PaddingValues(bottom = 80.dp)) {
                    items(displayFiles) { file ->
                        val isSelected = selectedFiles.contains(file)
                        FileRowItem(
                            file = file, isSelected = isSelected,
                            onClick = {
                                if (file.isDir) onNavigate(file.path)
                                else selectedFiles = if (isSelected) selectedFiles - file else selectedFiles + file
                            }
                        )
                    }
                }
            }
        }

        // ─── FLOATING ACTION BUTTONS ───
        Column(modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp), horizontalAlignment = Alignment.End) {
            SmallFloatingActionButton(
                onClick = onShareClipboardClick,
                containerColor = Color(0xFFa78bfa).copy(alpha = 0.15f), // High transparency
                contentColor = Color(0xFFa78bfa),
                elevation = FloatingActionButtonDefaults.elevation(0.dp, 0.dp, 0.dp, 0.dp), // Remove shadow for true glass look
                modifier = Modifier
                    .padding(bottom = 12.dp)
                    // Optional: If running strictly on Android 12+, you can add actual blur here
                    // .graphicsLayer { renderEffect = android.graphics.RenderEffect.createBlurEffect(20f, 20f, android.graphics.Shader.TileMode.CLAMP).asComposeRenderEffect() }
                ,
                shape = RoundedCornerShape(12.dp)
            ) {
                Icon(Icons.Filled.ContentPaste, contentDescription = "Share Clipboard")
            }

            // ── Dynamic FAB Swap Logic ──
            if (selectedFiles.isNotEmpty()) {
                FloatingActionButton(
                    onClick = {
                        onDownloadFiles(selectedFiles.toList())
                        selectedFiles = emptySet()
                    },
                    containerColor = GreenAccent,
                    contentColor = BgBase,
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.download),
                        contentDescription = "Download",
                        modifier = Modifier.size(24.dp)
                    )
                }
            } else {
                var showAddMenu by remember { mutableStateOf(false) }
                Box {
                    FloatingActionButton(onClick = { showAddMenu = true }, containerColor = Accent, contentColor = BgBase, shape = RoundedCornerShape(16.dp)) {
                        Icon(Icons.Filled.Add, contentDescription = "Add Actions")
                    }

                    MaterialTheme(shapes = MaterialTheme.shapes.copy(extraSmall = RoundedCornerShape(16.dp))) {
                        DropdownMenu(expanded = showAddMenu, onDismissRequest = { showAddMenu = false }, modifier = Modifier.background(Panel)) {
                            DropdownMenuItem(
                                text = { Text("Upload File", color = TextPrimary) },
                                onClick = { showAddMenu = false; filePickerLauncher.launch("*/*") },
                                leadingIcon = { Icon(Icons.Filled.UploadFile, tint = Accent, contentDescription = null) }
                            )
                            HorizontalDivider(
                                modifier = Modifier.padding(vertical = 4.dp),
                                thickness = DividerDefaults.Thickness,
                                color = Surface
                            )

                            DropdownMenuItem(
                                text = { Text("Upload Folder", color = TextPrimary) },
                                onClick = { showAddMenu = false; folderPickerLauncher.launch(null) },
                                leadingIcon = { Icon(Icons.Filled.Folder, tint = Color(0xFFa78bfa), contentDescription = null) }
                            )

                            HorizontalDivider(
                                modifier = Modifier.padding(vertical = 4.dp),
                                thickness = DividerDefaults.Thickness,
                                color = Surface
                            )
                            DropdownMenuItem(
                                text = { Text("Create Folder", color = TextPrimary) },
                                onClick = { showAddMenu = false; showCreateFolderDialog = true },
                                leadingIcon = { Icon(Icons.Filled.CreateNewFolder, tint = GreenAccent, contentDescription = null) }
                            )
                        }
                    }
                }
            }
        }
    }
}

val imageExts = setOf("jpg", "jpeg", "png", "gif", "webp", "heic", "svg", "bmp", "ico", "tiff")
val videoExts = setOf("mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "3gp")
val audioExts = setOf("mp3", "flac", "wav", "aac", "ogg", "m4a", "opus", "wma")
val archiveExts = setOf("zip", "rar", "tar", "gz", "bz2", "7z", "xz", "dmg", "iso", "apk")
val codeExts = setOf("js", "ts", "tsx", "jsx", "py", "go", "rs", "java", "kt", "swift", "c", "cpp", "h", "cs", "php", "rb", "sh", "bash", "json", "yaml", "yml", "toml", "xml", "html", "css", "scss", "sql")
val docExts = setOf("txt", "md", "pdf", "doc", "docx", "rtf", "pages", "odt", "epub")
val sheetExts = setOf("xls", "xlsx", "csv", "numbers", "ods")

fun getFileExtension(name: String): String = name.substringAfterLast('.', "").lowercase()

@Composable
fun DynamicFileIcon(name: String, isDir: Boolean, modifier: Modifier = Modifier) {
    val ext = getFileExtension(name)
    val icon = when {
        isDir -> Icons.Outlined.Folder
        imageExts.contains(ext) -> Icons.Rounded.Image
        videoExts.contains(ext) -> Icons.Rounded.Movie
        audioExts.contains(ext) -> Icons.Rounded.Audiotrack
        archiveExts.contains(ext) -> Icons.Rounded.Archive
        codeExts.contains(ext) -> Icons.Rounded.Code
        docExts.contains(ext) -> Icons.Rounded.Description
        sheetExts.contains(ext) -> Icons.AutoMirrored.Rounded.ListAlt
        else -> Icons.AutoMirrored.Rounded.InsertDriveFile
    }
    val tint = when {
        isDir -> Color(0xFF3d9eff)
        imageExts.contains(ext) -> Color(0xFFA78BFA)
        videoExts.contains(ext) -> Color(0xFFF87171)
        audioExts.contains(ext) -> Color(0xFF34D399)
        archiveExts.contains(ext) -> Color(0xFFF0A44A)
        codeExts.contains(ext) -> Color(0xFF00C9A7)
        docExts.contains(ext) -> Color(0xFF93C5FD)
        sheetExts.contains(ext) -> Color(0xFF6EE7B7)
        else -> Color(0xFF8090A8)
    }
    Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = modifier)
}

@Composable
fun DeviceIcon(os: String, tint: Color, modifier: Modifier = Modifier) {
    val lower = os.lowercase()
    val icon = when (lower) {
        "android", "ios" -> Icons.Rounded.Smartphone
        "windows", "darwin", "linux", "mac" -> Icons.Rounded.Computer
        else -> Icons.Rounded.Devices
    }
    Icon(icon, contentDescription = "Device", tint = tint, modifier = modifier)
}

@Composable
fun FileRowItem(file: FileInfo, isSelected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().background(if (isSelected) Accent.copy(alpha = 0.1f) else Color.Transparent)
            .clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (isSelected) {
            Icon(Icons.Filled.CheckCircle, contentDescription = "Selected", tint = Accent, modifier = Modifier.size(24.dp))
        } else {
            DynamicFileIcon(name = file.name, isDir = file.isDir, modifier = Modifier.size(24.dp))
        }
        Spacer(modifier = Modifier.width(16.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(file.name, color = if (file.isDir) TextPrimary else (if (isSelected) Accent else TextMuted), fontSize = 14.sp, fontWeight = if (file.isDir || isSelected) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1)
            if (!file.isDir) Text(formatSize(file.size), color = TextMuted.copy(alpha = 0.7f), fontSize = 11.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace, modifier = Modifier.padding(top = 2.dp))
        }
    }
    HorizontalDivider(
        modifier = Modifier.padding(start = 60.dp),
        thickness = DividerDefaults.Thickness,
        color = Panel
    )
}

fun formatSize(size: Long): String {
    if (size <= 0) return "0 B"

    val units = arrayOf("B", "KB", "MB", "GB", "TB")
    val digitGroups = (log10(size.toDouble()) / log10(1024.0)).toInt()

    return String.format(
        Locale.US,
        "%.1f %s",
        size / 1024.0.pow(digitGroups.toDouble()),
        units[digitGroups]
    )
}