package com.xrontrix.lansync.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LANSyncColorScheme = darkColorScheme(
    background = BgBase,
    surface = Surface,
    surfaceVariant = Panel,
    primary = Accent,
    secondary = LightAccent, // Updated to Gold
    error = RedAccent,
    onBackground = TextPrimary,
    onSurface = TextPrimary
)

@Composable
fun LansyncTheme(
    content: @Composable () -> Unit
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window

            // ── Suppress the API 35 Integer deprecation warnings ──
            @Suppress("DEPRECATION")
            window.statusBarColor = BgBase.toArgb()
            @Suppress("DEPRECATION")
            window.navigationBarColor = Surface.toArgb()

            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }

    MaterialTheme(
        colorScheme = LANSyncColorScheme,
        typography = Typography,
        content = content
    )
}