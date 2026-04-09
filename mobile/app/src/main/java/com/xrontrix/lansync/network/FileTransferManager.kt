package com.xrontrix.lansync.network

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import bridge.Bridge
import com.xrontrix.lansync.ui.screens.FileInfo
import com.xrontrix.lansync.ui.screens.formatSize
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.atomic.AtomicBoolean

class FileTransferManager(private val context: Context) {
    private val mainHandler = Handler(Looper.getMainLooper())
    
    // ── THE CANCEL FLAG ──
    private var isCancelled = AtomicBoolean(false)

    // ── DYNAMIC RECEIVER FOR NOTIFICATION BUTTON CLICKS ──
    private val cancelReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent?.action == "com.xrontrix.lansync.CANCEL_TRANSFER") {
                val ip = intent.getStringExtra("ip") ?: return
                cancelActiveTransfers(ip)
            }
        }
    }

    init {
        // Register the receiver dynamically so no Manifest edits are needed
        ContextCompat.registerReceiver(
            context.applicationContext,
            cancelReceiver,
            IntentFilter("com.xrontrix.lansync.CANCEL_TRANSFER"),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
    }

    private fun runOnMain(action: () -> Unit) {
        mainHandler.post(action)
    }

    fun cancelActiveTransfers(ip: String) {
        isCancelled.set(true)
        Thread {
            try {
                val token = Bridge.getSessionToken(ip)
                val url = URL("http://$ip:34931/api/files/cancel")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.responseCode
            } catch (e: Exception) {}
        }.start()
        runOnMain { Toast.makeText(context, "Cancelling transfers...", Toast.LENGTH_SHORT).show() }
    }

    // ── Helper to generate the Notification Cancel Button Intent ──
    private fun getCancelAction(ip: String, notificationId: Int): NotificationCompat.Action {
        val cancelIntent = Intent("com.xrontrix.lansync.CANCEL_TRANSFER").apply {
            setPackage(context.packageName)
            putExtra("ip", ip)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            notificationId,
            cancelIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Action.Builder(
            android.R.drawable.ic_menu_close_clear_cancel,
            "Cancel", 
            pendingIntent
        ).build()
    }

    private fun uploadSingleFile(ip: String, token: String, remotePath: String, uri: Uri, fileName: String): Boolean {
        return try {
            val encodedPath = URLEncoder.encode(remotePath, "UTF-8").replace("+", "%20")
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
                
                context.contentResolver.openInputStream(uri)?.use { input ->
                    val buffer = ByteArray(65536)
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        if (isCancelled.get()) return false // Abort mid-stream
                        outputStream.write(buffer, 0, bytesRead)
                    }
                }
                
                outputStream.writeBytes("\r\n--$boundary--\r\n")
                outputStream.flush()
            }
            val code = connection.responseCode
            connection.disconnect()
            code == 200
        } catch (e: Exception) { false }
    }

    fun uploadFiles(ip: String, currentPath: String, uris: List<Uri>, onComplete: () -> Unit) {
        val token = Bridge.getSessionToken(ip)
        if (token.isEmpty()) return

        isCancelled.set(false)

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel("upload_channel", "File Uploads", NotificationManager.IMPORTANCE_LOW)
        notificationManager.createNotificationChannel(channel)

        Thread {
            var successCount = 0
            for (uri in uris) {
                if (isCancelled.get()) break 

                var fileName = "upload.file"
                context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (cursor.moveToFirst() && nameIndex >= 0) fileName = cursor.getString(nameIndex)
                }

                val notificationId = System.currentTimeMillis().toInt()
                val builder = NotificationCompat.Builder(context, "upload_channel")
                    .setSmallIcon(android.R.drawable.stat_sys_upload)
                    .setContentTitle("Uploading $fileName")
                    .setContentText("Uploading in progress...")
                    .setOngoing(true)
                    .setProgress(0, 0, true)
                    .addAction(getCancelAction(ip, notificationId)) // Add Cancel Button

                notificationManager.notify(notificationId, builder.build())

                if (uploadSingleFile(ip, token, currentPath, uri, fileName)) {
                    successCount++
                    builder.setContentTitle("Upload Complete").setContentText(fileName)
                } else {
                    builder.setContentTitle(if (isCancelled.get()) "Upload Cancelled" else "Upload Failed")
                    builder.setContentText(fileName)
                }
                
                // Clear the progress bar and the cancel button
                builder.clearActions().setProgress(0, 0, false).setOngoing(false)
                notificationManager.notify(notificationId, builder.build())
            }

            runOnMain {
                if (!isCancelled.get()) {
                    Toast.makeText(context, "Uploaded $successCount of ${uris.size} files", Toast.LENGTH_SHORT).show()
                }
                onComplete()
            }
        }.start()
    }

    fun uploadFolder(ip: String, currentPath: String, treeUri: Uri, onComplete: () -> Unit, onError: () -> Unit) {
        val token = Bridge.getSessionToken(ip)
        if (token.isEmpty()) {
            runOnMain { onError() }
            return
        }

        isCancelled.set(false)

        Thread {
            try {
                val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))
                var rootFolderName = "UploadedFolder"

                context.contentResolver.query(DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri)), null, null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (nameIndex >= 0) rootFolderName = cursor.getString(nameIndex)
                    }
                }

                Bridge.makeDirectory(ip, "34931", currentPath, rootFolderName)
                val newRemoteBasePath = if (currentPath == "/") "/$rootFolderName" else "$currentPath/$rootFolderName"
                var successCount = 0

                fun traverse(uri: Uri, remotePath: String) {
                    if (isCancelled.get()) return 
                    
                    context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                        val idIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        val mimeIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)

                        while (cursor.moveToNext()) {
                            if (isCancelled.get()) break 
                            
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

                runOnMain {
                    if (!isCancelled.get()) {
                        Toast.makeText(context, "Uploaded $successCount files from folder", Toast.LENGTH_SHORT).show()
                    }
                    onComplete()
                }
            } catch (e: Exception) {
                runOnMain {
                    Toast.makeText(context, "Folder upload failed", Toast.LENGTH_SHORT).show()
                    onError()
                }
            }
        }.start()
    }

    fun downloadFiles(ip: String, files: List<FileInfo>) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel("download_channel", "File Downloads", NotificationManager.IMPORTANCE_LOW)
        notificationManager.createNotificationChannel(channel)

        isCancelled.set(false)

        Thread {
            var successCount = 0
            val sharedPrefs = context.getSharedPreferences("lansync_prefs", Context.MODE_PRIVATE)
            val savedDownloadUri = sharedPrefs.getString("download_folder", "") ?: ""

            var downloadPath = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).absolutePath + "/LANSync"

            if (savedDownloadUri.isNotBlank()) {
                try {
                    val decoded = java.net.URLDecoder.decode(savedDownloadUri, "UTF-8")
                    if (decoded.contains("primary:")) {
                        downloadPath = Environment.getExternalStorageDirectory().absolutePath + "/" + decoded.substringAfterLast("primary:")
                    }
                } catch (e: Exception) {}
            }

            val dir = File(downloadPath)
            if (!dir.exists()) dir.mkdirs()

            for ((index, file) in files.withIndex()) {
                if (isCancelled.get()) break 

                val notificationId = System.currentTimeMillis().toInt() + index
                val builder = NotificationCompat.Builder(context, "download_channel")
                    .setSmallIcon(android.R.drawable.stat_sys_download)
                    .setContentTitle("Downloading ${file.name}")
                    .setContentText("Connecting...")
                    .setOngoing(true)
                    .setProgress(100, 0, true)
                    .addAction(getCancelAction(ip, notificationId)) // Add Cancel Button

                notificationManager.notify(notificationId, builder.build())

                try {
                    val token = Bridge.getSessionToken(ip)
                    val encodedPath = URLEncoder.encode(file.path, "UTF-8").replace("+", "%20")
                    val url = URL("http://$ip:34931/api/files/download?path=$encodedPath")
                    val connection = url.openConnection() as HttpURLConnection
                    connection.requestMethod = "GET"
                    connection.setRequestProperty("Authorization", "Bearer $token")
                    connection.setRequestProperty("Accept-Encoding", "identity")
                    connection.connect()

                    if (connection.responseCode != 200) throw Exception("Server returned ${connection.responseCode}")

                    val reportedLength =
                        connection.contentLengthLong
                    val fileLength = if (reportedLength > 0) reportedLength else file.size

                    val input = connection.inputStream
                    val destFile = File(dir, file.name)
                    val output = FileOutputStream(destFile)

                    val buffer = ByteArray(65536)
                    var bytesRead: Int
                    var total = 0L
                    var lastUpdateTime = System.currentTimeMillis()
                    var lastUpdateBytes = 0L

                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        
                        // ── GHOST FILE ROLLBACK ──
                        if (isCancelled.get()) {
                            output.close()
                            input.close()
                            destFile.delete() // Delete corrupted half-file!
                            
                            builder.setContentTitle("Download Cancelled").setContentText(file.name)
                            builder.clearActions().setOngoing(false).setProgress(0,0,false)
                            notificationManager.notify(notificationId, builder.build())
                            return@Thread // End entire transfer thread safely
                        }

                        output.write(buffer, 0, bytesRead)
                        total += bytesRead

                        val currentTime = System.currentTimeMillis()
                        if (currentTime - lastUpdateTime > 500) {
                            val progressPercent = if (fileLength > 0) (total * 100 / fileLength).toInt() else 0
                            val timeDiff = (currentTime - lastUpdateTime) / 1000.0
                            val bytesDiff = total - lastUpdateBytes
                            val speedBps = if (timeDiff > 0) (bytesDiff / timeDiff) else 0.0

                            builder.setProgress(100, progressPercent, fileLength <= 0L)
                            builder.setContentText("${formatSize(total)} / ${if (fileLength > 0) formatSize(fileLength) else "Unknown"} • ${formatSize(speedBps.toLong())}/s")
                            notificationManager.notify(notificationId, builder.build())

                            lastUpdateTime = currentTime
                            lastUpdateBytes = total
                        }
                    }
                    output.flush()
                    output.close()
                    input.close()

                    MediaScannerConnection.scanFile(context, arrayOf(destFile.absolutePath), null, null)

                    builder.setContentTitle("Download Complete").setContentText(file.name)
                    builder.clearActions().setProgress(0, 0, false).setOngoing(false)
                    notificationManager.notify(notificationId, builder.build())
                    successCount++

                } catch (e: Exception) {
                    builder.setContentTitle("Download Failed").setContentText("${file.name}: ${e.message}")
                    builder.clearActions().setProgress(0, 0, false).setOngoing(false)
                    notificationManager.notify(notificationId, builder.build())
                }
            }

            val displayPath = if (downloadPath.contains("Download/LANSync")) "Download/LANSync" else downloadPath.substringAfterLast("/")
            runOnMain {
                if (!isCancelled.get()) {
                    Toast.makeText(context, "Saved $successCount file(s) to $displayPath", Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }
}