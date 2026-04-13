package com.xrontrix.lansync.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.*
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.sp
import com.xrontrix.lansync.data.RecentDevice
import com.xrontrix.lansync.ui.theme.*
import com.xrontrix.lansync.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    deviceName: String,
    isNetworkAvailable: Boolean,
    localIP: String,
    activeDeviceIP: String?,
    activeDeviceOS: String,
    recentDevices: List<RecentDevice>,
    discoveredDevices: List<com.xrontrix.lansync.viewmodel.DiscoveredDevice>,
    isConnecting: Boolean,
    clearIPInputTrigger: Int,
    onConnect: (String) -> Unit,
    onDisconnect: () -> Unit,
    onRemoveRecentDevice: (String) -> Unit,
    onRefreshNetwork: () -> Unit
) {
    val focusRequesters = remember { List(4) { FocusRequester() } }
    var ipSegments by remember { mutableStateOf(listOf("", "", "", "")) }
    // Reset IP fields whenever a successful connection fires from ViewModel
    LaunchedEffect(clearIPInputTrigger) {
        if (clearIPInputTrigger > 0) ipSegments = listOf("", "", "", "")
    }
    val isIpComplete = ipSegments.all { it.isNotEmpty() }
    val fullIp = ipSegments.joinToString(".")

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(20.dp))

        Text(
            text = buildAnnotatedString {
                withStyle(style = SpanStyle(color = Accent)) { append("LAN") }
                withStyle(style = SpanStyle(color = TextPrimary)) { append("Sync") }
            },
            fontSize = 28.sp, fontWeight = FontWeight.Black, letterSpacing = 4.sp
        )

        Spacer(modifier = Modifier.height(12.dp))

        Surface(
            color = Panel, shape = RoundedCornerShape(8.dp),
            border = BorderStroke(1.dp, Surface)
        ) {
            Text(
                text = deviceName, fontSize = 13.sp, color = TextPrimary,
                fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        val infiniteTransition = rememberInfiniteTransition(label = "ping")
        val pingScale by infiniteTransition.animateFloat(
            initialValue = 1f, targetValue = 2.5f,
            animationSpec = infiniteRepeatable(animation = tween(1200, easing = LinearOutSlowInEasing), repeatMode = RepeatMode.Restart),
            label = "scale"
        )
        val pingAlpha by infiniteTransition.animateFloat(
            initialValue = 0.7f, targetValue = 0f,
            animationSpec = infiniteRepeatable(animation = tween(1200, easing = LinearOutSlowInEasing), repeatMode = RepeatMode.Restart),
            label = "alpha"
        )

        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(14.dp)) {
                if (isNetworkAvailable) {
                    Box(modifier = Modifier.size(8.dp).scale(pingScale).alpha(pingAlpha).background(LightAccent, CircleShape))
                    Box(modifier = Modifier.size(8.dp).background(LightAccent, CircleShape))
                } else {
                    Box(modifier = Modifier.size(8.dp).background(RedAccent, CircleShape))
                }
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = if (isNetworkAvailable) localIP else "No Network",
                fontSize = 14.sp, color = TextMuted, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.width(8.dp))
            IconButton(onClick = onRefreshNetwork, modifier = Modifier.size(20.dp)) {
                Icon(painter = painterResource(R.drawable.refresh), contentDescription = "Refresh", tint = TextMuted.copy(alpha = 0.5f), modifier = Modifier.size(16.dp))
            }
        }

        // Only push the Disconnected Card to the center of the screen
        if (!isNetworkAvailable) Spacer(modifier = Modifier.weight(1f)) else Spacer(modifier = Modifier.height(24.dp))

        if (!isNetworkAvailable) {
            Card(
                colors = CardDefaults.cardColors(containerColor = Accent.copy(alpha = 0.1f)),
                border = BorderStroke(1.dp, Accent.copy(alpha = 0.3f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                // Properly centered content inside the card
                Column(modifier = Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(painter = painterResource(R.drawable.filled_wifi_off), contentDescription = "No Wifi", tint = Accent, modifier = Modifier.size(40.dp))
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("Network Disconnected", color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Please connect to a network to use LANSync.", color = TextMuted, textAlign = TextAlign.Center, fontSize = 13.sp)
                }
            }
        } else {
            // ── AVAILABLE DEVICES ──
            val availableToConnect = discoveredDevices.filter { d -> 
                val connectedName = activeDeviceIP?.let { ip -> recentDevices.find { it.ip == ip }?.name } ?: "Connected Device"
                d.ip != localIP && d.ip != activeDeviceIP && d.deviceName != connectedName
            }
            Text("AVAILABLE DEVICES", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 1.sp, modifier = Modifier.align(Alignment.Start).padding(start = 4.dp, bottom = 8.dp))
            
            if (availableToConnect.isEmpty()) {
                val infiniteTransitionLoader = rememberInfiniteTransition(label = "loader")
                val rotation by infiniteTransitionLoader.animateFloat(
                    initialValue = 0f, targetValue = 360f,
                    animationSpec = infiniteRepeatable(animation = tween(1000, easing = LinearEasing), repeatMode = RepeatMode.Restart),
                    label = "rotation"
                )
                Row(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp, start = 4.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        painter = painterResource(R.drawable.refresh), 
                        contentDescription = "Looking", 
                        tint = Accent, 
                        modifier = Modifier.size(16.dp).graphicsLayer { rotationZ = rotation }.alpha(0.8f)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Looking for devices...", color = TextMuted, fontSize = 13.sp)
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
                    availableToConnect.forEach { device ->
                        Surface(
                            color = Panel, shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, Surface),
                            modifier = Modifier.fillMaxWidth().clickable {
                                onConnect(device.ip)
                            }
                        ) {
                            Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                DeviceIcon(device.os, Accent, Modifier.size(24.dp))
                                Spacer(modifier = Modifier.width(16.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(device.deviceName, color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                    Text(device.ip, color = TextMuted.copy(alpha = 0.7f), fontSize = 11.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 2.dp))
                                }
                                IconButton(onClick = { onConnect(device.ip) }, modifier = Modifier.size(32.dp)) {
                                    Icon(painter = painterResource(R.drawable.connect), contentDescription = "Connect", tint = Accent, modifier = Modifier.size(18.dp))
                                }
                            }
                        }
                    }
                }
            }

            Text("MANUAL CONNECT", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 1.sp, modifier = Modifier.align(Alignment.Start).padding(start = 4.dp, bottom = 8.dp))

            // ── Track focus state of all 4 inputs ──
            val focusStates = remember { mutableStateListOf(false, false, false, false) }
            val isAnyFocused = focusStates.any { it }

            Card(
                colors = CardDefaults.cardColors(containerColor = Panel),
                border = BorderStroke(1.dp, Surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.fillMaxWidth().padding(20.dp)) {
                    Text("Connect to Device", color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Spacer(modifier = Modifier.height(16.dp))

                    // ─── BEAUTIFUL SINGLE-BOX 4-PART IP INPUT ───
                    Surface(
                        color = BgBase,
                        shape = RoundedCornerShape(10.dp),
                        // ── Show border if ANY field is focused OR if the IP is complete ──
                        border = BorderStroke(1.dp, if (isAnyFocused || isIpComplete) Accent else Surface),
                        modifier = Modifier.fillMaxWidth().height(55.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxSize(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center
                        ) {
                            ipSegments.forEachIndexed { index, segment ->
                                BasicTextField(
                                    value = segment,
                                    onValueChange = { newVal ->
                                        if (newVal.endsWith(".")) {
                                            if (index < 3 && segment.isNotEmpty()) focusRequesters[index + 1].requestFocus()
                                        } else {
                                            val digits = newVal.filter { it.isDigit() }
                                            if (digits.length <= 3 && (digits.isEmpty() || digits.toInt() in 0..255)) {
                                                val newList = ipSegments.toMutableList()
                                                newList[index] = digits
                                                ipSegments = newList
                                                if (digits.length == 3 && index < 3) focusRequesters[index + 1].requestFocus()
                                            }
                                        }
                                    },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    singleLine = true,
                                    cursorBrush = SolidColor(Accent),
                                    textStyle = TextStyle(
                                        color = TextPrimary, fontSize = 18.sp,
                                        fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold,
                                        textAlign = TextAlign.Center
                                    ),
                                    modifier = Modifier
                                        .width(48.dp)
                                        .focusRequester(focusRequesters[index])
                                        .onFocusChanged { focusState ->
                                            focusStates[index] = focusState.isFocused
                                        }
                                        .onKeyEvent { event ->
                                            if (event.key == Key.Backspace && event.type == KeyEventType.KeyDown && segment.isEmpty() && index > 0) {
                                                focusRequesters[index - 1].requestFocus()
                                                true
                                            } else false
                                        }
                                )
                                if (index < 3) {
                                    Text(".", color = TextMuted.copy(alpha = 0.5f), fontSize = 24.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(bottom = 6.dp))
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Button(
                        onClick = {
                            onConnect(fullIp)
                        },
                        enabled = isIpComplete && !isConnecting,
                        colors = ButtonDefaults.buttonColors(containerColor = Accent.copy(alpha = 0.15f), contentColor = Accent),
                        modifier = Modifier.fillMaxWidth().height(50.dp), shape = RoundedCornerShape(10.dp)
                    ) {
                        if (isConnecting) {
                            CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Accent, strokeWidth = 2.dp)
                        } else {
                            Icon(painter = painterResource(R.drawable.connect), contentDescription = "Connect", modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Connect", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        if (!isNetworkAvailable) Spacer(modifier = Modifier.weight(1f)) else Spacer(modifier = Modifier.height(24.dp))

        // ... Connected & Recent Devices
        Column(modifier = Modifier.fillMaxWidth()) {
            if (activeDeviceIP != null) {
                val activeDevice = recentDevices.find { it.ip == activeDeviceIP } ?: RecentDevice(activeDeviceIP, "Connected Device")

                // Match Desktop Header Color
                Text("CONNECTED DEVICE", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 1.sp, modifier = Modifier.padding(start = 4.dp, bottom = 8.dp))

                Surface(
                    color = Accent.copy(alpha = 0.08f),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, Accent.copy(alpha = 0.3f)),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                ) {
                    Box {
                        // ── Active Left Glow Bar ──
                        Box(
                            modifier = Modifier
                                .align(Alignment.CenterStart)
                                .padding(vertical = 12.dp)
                                .width(3.dp)
                                .height(40.dp)
                                .background(Accent, RoundedCornerShape(topEnd = 4.dp, bottomEnd = 4.dp))
                        )

                        Row(
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            DeviceIcon(activeDeviceOS, Accent, Modifier.size(20.dp))

                            Spacer(modifier = Modifier.width(14.dp))

                            Column(modifier = Modifier.weight(1f)) {
                                Text(activeDevice.name, color = TextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                                Text(activeDevice.ip.substringBefore(":"), color = TextMuted, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                            }
                            // Disconnect button
                            Surface(
                                onClick = onDisconnect,
                                color = RedAccent.copy(alpha = 0.1f),
                                shape = RoundedCornerShape(6.dp),
                                modifier = Modifier.size(28.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        painter = painterResource(R.drawable.close),
                                        contentDescription = "Disconnect",
                                        tint = RedAccent,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            val filteredRecent = recentDevices.filter { d -> 
                val connectedName = activeDeviceIP?.let { ip -> recentDevices.find { it.ip == ip }?.name } ?: "Connected Device"
                d.ip != activeDeviceIP && d.name != connectedName 
            }
            if (filteredRecent.isNotEmpty()) {
                Text("RECENT DEVICES", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextMuted, letterSpacing = 1.sp, modifier = Modifier.padding(start = 4.dp, bottom = 8.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 16.dp)) {
                    items(filteredRecent) { device ->
                        Surface(
                            color = Panel, shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, Surface),
                            modifier = Modifier.fillMaxWidth().clickable(enabled = isNetworkAvailable) {
                                onConnect(device.ip)
                            }
                        ) {
                            Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(painter = painterResource(R.drawable.history), contentDescription = "History", tint = TextMuted)
                                Spacer(modifier = Modifier.width(16.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(device.name, color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                    Text(device.ip, color = TextMuted.copy(alpha = 0.7f), fontSize = 11.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 2.dp))
                                }
                                IconButton(onClick = { onRemoveRecentDevice(device.ip) }, modifier = Modifier.size(32.dp)) {
                                    Icon(painter = painterResource(R.drawable.close), contentDescription = "Remove", tint = TextMuted.copy(alpha = 0.5f))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}