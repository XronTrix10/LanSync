package com.xrontrix.lansync.network

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.core.app.NotificationCompat
import bridge.Bridge
import com.xrontrix.lansync.R
import com.xrontrix.lansync.ui.screens.FileInfo
import com.xrontrix.lansync.ui.screens.formatSize
import android.media.MediaScannerConnection
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class FileTransferManager(private val context: Context) {
    private val mainHandler = Handler(Looper.getMainLooper())

    private fun runOnMain(action: () -> Unit) {
        mainHandler.post(action)
    }

    fun uploadSingleFile(ip: String, token: String, remotePath: String, uri: Uri, fileName: String): Boolean {
        return try {
            val encodedPath = URLEncoder.encode(remotePath, "UTF-8")
            val url = URL("http://$ip:34931/api/files/upload?dir=$encodedPath")
            val connection = url.openConnection() as HttpURLConnection
            val boundary = "Boundary-${System.currentTimeMillis()}"

            connection.requestMethod = "POST"
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            connection.doOutput = true
            connection.setChunkedStreamingMode(65536)

            val outputStream = DataOutputStream(connection.outputStream)
            outputStream.writeBytes("--$boundary\r\n")
            outputStream.writeBytes("Content-Disposition: form-data; name=\"files\"; filename=\"$fileName\"\r\n")
            outputStream.writeBytes("Content-Type: application/octet-stream\r\n\r\n")

            context.contentResolver.openInputStream(uri)?.use { input ->
                val buffer = ByteArray(65536)
                var bytesRead: Int
                while (input.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                }
            }

            outputStream.writeBytes("\r\n--$boundary--\r\n")
            outputStream.flush()
            outputStream.close()

            connection.responseCode == HttpURLConnection.HTTP_OK
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    fun uploadFiles(ip: String, port: String, remotePath: String, uris: List<Uri>) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = NotificationChannel("upload_channel", "File Uploads", NotificationManager.IMPORTANCE_LOW)
            notificationManager.createNotificationChannel(channel)
        }

        Thread {
            var successCount = 0
            for (uri in uris) {
                val fileName = getFileName(uri)
                val notificationId = System.currentTimeMillis().toInt()
                val builder = NotificationCompat.Builder(context, "upload_channel")
                    .setSmallIcon(R.drawable.upload) 
                    .setContentTitle("Uploading $fileName")
                    .setContentText("Uploading in progress...")
                    .setOngoing(true)
                    .setProgress(0, 0, true)

                notificationManager.notify(notificationId, builder.build())

                val token = Bridge.getSessionToken(ip)
                if (uploadSingleFile(ip, token, remotePath, uri, fileName)) {
                    successCount++
                    builder.setContentTitle("Upload Complete").setContentText(fileName).setProgress(0, 0, false).setOngoing(false)
                } else {
                    builder.setContentTitle("Upload Failed").setContentText(fileName).setProgress(0, 0, false).setOngoing(false)
                }
                notificationManager.notify(notificationId, builder.build())
            }

            runOnMain {
                Toast.makeText(context, "Successfully uploaded $successCount file(s)", Toast.LENGTH_SHORT).show()
            }
        }.start()
    }

    fun downloadFiles(ip: String, port: String, remotePaths: List<String>, fileInfos: List<FileInfo>) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = NotificationChannel("download_channel", "File Downloads", NotificationManager.IMPORTANCE_LOW)
            notificationManager.createNotificationChannel(channel)
        }

        Thread {
            var successCount = 0

            // ── FIX: Resolve the true custom Download directory ──
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

            for ((index, path) in remotePaths.withIndex()) {
                val file = fileInfos[index]
                val notificationId = System.currentTimeMillis().toInt()
                val builder = NotificationCompat.Builder(context, "download_channel")
                    .setSmallIcon(R.drawable.download) 
                    .setContentTitle("Downloading ${file.name}")
                    .setContentText("Connecting...")
                    .setOngoing(true)
                    .setProgress(100, 0, true)

                notificationManager.notify(notificationId, builder.build())

                try {
                    val token = Bridge.getSessionToken(ip)
                    val encodedPath = URLEncoder.encode(path, "UTF-8")
                    val url = URL("http://$ip:34931/api/files/download?path=$encodedPath")
                    val connection = url.openConnection() as HttpURLConnection
                    connection.requestMethod = "GET"
                    connection.setRequestProperty("Authorization", "Bearer $token")
                    connection.connect()

                    val fileLength = connection.contentLength.toLong()
                    val input = connection.inputStream

                    val destFile = File(dir, file.name)
                    val output = FileOutputStream(destFile)

                    val buffer = ByteArray(65536)
                    var bytesRead: Int
                    var total = 0L
                    var lastUpdateTime = System.currentTimeMillis()
                    var lastUpdateBytes = 0L

                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        total += bytesRead

                        val currentTime = System.currentTimeMillis()
                        if (currentTime - lastUpdateTime > 500) {
                            val progressPercent = if (fileLength > 0) (total * 100 / fileLength).toInt() else 0
                            val timeDiff = (currentTime - lastUpdateTime) / 1000.0
                            val bytesDiff = total - lastUpdateBytes
                            val speedBps = if (timeDiff > 0) (bytesDiff / timeDiff) else 0.0

                            val speedStr = formatSize(speedBps.toLong()) + "/s"
                            val totalStr = formatSize(total)
                            val sizeStr = if (fileLength > 0) formatSize(fileLength) else "Unknown"

                            builder.setProgress(100, progressPercent, fileLength <= 0L)
                            builder.setContentText("$totalStr / $sizeStr • $speedStr")
                            notificationManager.notify(notificationId, builder.build())

                            lastUpdateTime = currentTime
                            lastUpdateBytes = total
                        }
                    }
                    output.flush()
                    output.close()
                    input.close()

                    // ── Force Android to index the file so it appears in the Gallery/Explorer instantly! ──
                    MediaScannerConnection.scanFile(context, arrayOf(destFile.absolutePath), null, null)

                    builder.setContentTitle("Download Complete").setContentText(file.name).setProgress(0, 0, false).setOngoing(false)
                    notificationManager.notify(notificationId, builder.build())
                    successCount++

                } catch (e: Exception) {
                    builder.setContentTitle("Download Failed").setContentText("${file.name}: ${e.message}").setProgress(0, 0, false).setOngoing(false)
                    notificationManager.notify(notificationId, builder.build())
                }
            }

            // ── Format path correctly in the Toast ──
            val displayPath = if (downloadPath.contains("Download/LANSync")) "Download/LANSync" else downloadPath.substringAfterLast("/")
            runOnMain {
                Toast.makeText(context, "Saved $successCount file(s) to $displayPath", Toast.LENGTH_LONG).show()
            }
        }.start()
    }

    private fun getFileName(uri: Uri): String {
        var result: String? = null
        if (uri.scheme == "content") {
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (index != -1) result = cursor.getString(index)
                }
            }
        }
        return result ?: uri.path?.substringAfterLast('/') ?: "unknown_file"
    }
}
