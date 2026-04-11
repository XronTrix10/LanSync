package com.xrontrix.lansync.data

import android.content.Context
import android.content.SharedPreferences

// Add the OS field with a default fallback so it doesn't break old saves
data class RecentDevice(val ip: String, val name: String, val os: String = "windows")

class PreferencesManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("lansync_prefs", Context.MODE_PRIVATE)

    fun saveRecentDevice(ip: String, name: String) {
        val currentDevices = getRecentDevices().toMutableList()
        currentDevices.removeAll { it.ip == ip || it.name == name }
        currentDevices.add(0, RecentDevice(ip, name))
        val trimmedDevices = currentDevices.take(5)

        prefs.edit().apply {
            putString("recent_ips", trimmedDevices.joinToString(",") { it.ip })
            trimmedDevices.forEach { putString("device_name_${it.ip}", it.name) }
            apply()
        }
    }

    fun getRecentDevices(): List<RecentDevice> {
        val ipString = prefs.getString("recent_ips", "") ?: ""
        if (ipString.isBlank()) return emptyList()

        return ipString.split(",").map { ip ->
            val name = prefs.getString("device_name_$ip", "Unknown Device") ?: "Unknown Device"
            RecentDevice(ip, name)
        }
    }

    fun removeDevice(ip: String) {
        val currentIPs = getRecentDevices().map { it.ip }.toMutableList()
        currentIPs.remove(ip)
        prefs.edit().apply {
            putString("recent_ips", currentIPs.joinToString(","))
            remove("device_name_$ip")
            apply()
        }
    }
}