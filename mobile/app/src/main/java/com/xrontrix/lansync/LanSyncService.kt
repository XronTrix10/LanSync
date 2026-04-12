package com.xrontrix.lansync

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

class LANSyncService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private val channelId = "LANSyncConnectionChannel"

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // 1. Acquire a WakeLock to keep the CPU running when the screen is off
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LANSync::BackgroundSyncLock")
        wakeLock?.acquire(30*60*1000L /*30 minutes*/)

        // 2. Create the Intent to open the app if the user taps the notification
        val pendingIntent: PendingIntent = Intent(this, MainActivity::class.java).let { notificationIntent ->
            PendingIntent.getActivity(this, 0, notificationIntent, PendingIntent.FLAG_IMMUTABLE)
        }

        // 3. Build the persistent Foreground Notification
        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("LANSync is Active")
            .setContentText("File sharing is running in the background")
            .setSmallIcon(R.drawable.folder_outlined)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()

        // 4. Start the service in the foreground!
        startForeground(1, notification)

        // START_STICKY tells the OS to restart this service if it gets killed for memory
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        // Release the WakeLock so the phone can sleep again
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        val serviceChannel = NotificationChannel(
            channelId,
            "LANSync Connection",
            NotificationManager.IMPORTANCE_LOW // Low importance = no sound, just sits in the tray
        )
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(serviceChannel)
    }
}