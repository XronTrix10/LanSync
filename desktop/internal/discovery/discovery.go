package discovery

import (
	"encoding/json"
	"fmt"
	"net"
	"sync"
	"time"
)

type DiscoveryPacket struct {
	DeviceName string `json:"deviceName"`
	OS         string `json:"os"`
	Port       string `json:"port"`
}

type DiscoveredDevice struct {
	IP         string `json:"ip"`
	DeviceName string `json:"deviceName"`
	OS         string `json:"os"`
	LastSeen   time.Time `json:"-"`
}

var (
	devices  = make(map[string]*DiscoveredDevice)
	mu       sync.RWMutex
	onChange func(devices []DiscoveredDevice)
)

const discoveryPort = 34933

// Start initializes the UDP background broadcast and listener.
func Start(getDeviceName func() string, myOS string, onChangeCallback func(devices []DiscoveredDevice)) {
	onChange = onChangeCallback

	go listenForBroadcasts()
	go broadcastPresence(getDeviceName, myOS)
	go pruneStaleDevices()
}

func getBroadcastAddresses() []string {
	var addresses []string
	interfaces, err := net.Interfaces()
	if err != nil {
		return []string{"255.255.255.255"}
	}

	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			if ipNet, ok := addr.(*net.IPNet); ok && ipNet.IP.To4() != nil {
				ip := ipNet.IP.To4()
				mask := ipNet.Mask
				if len(mask) == 4 {
					bcastIP := make(net.IP, 4)
					for i := 0; i < 4; i++ {
						bcastIP[i] = ip[i] | ^mask[i]
					}
					addresses = append(addresses, bcastIP.String())
				}
			}
		}
	}

	if len(addresses) == 0 {
		addresses = append(addresses, "255.255.255.255")
	}
	return addresses
}

func broadcastPresence(getDeviceName func() string, myOS string) {
	for {
		name := getDeviceName()
		if name != "" {
			packet := DiscoveryPacket{
				DeviceName: name,
				OS:         myOS,
				Port:       "34931",
			}
			
			packetBytes, err := json.Marshal(packet)
			if err == nil {
				// We create a fresh connection each loop to handle changing network states gracefully.
				conn, err := net.ListenPacket("udp4", ":0")
				if err == nil {
					bcastAddrs := getBroadcastAddresses()
					for _, addr := range bcastAddrs {
						destAddr, _ := net.ResolveUDPAddr("udp4", fmt.Sprintf("%s:%d", addr, discoveryPort))
						if destAddr != nil {
							conn.WriteTo(packetBytes, destAddr)
						}
					}
					// Also always attempt the global broadcast
					globalAddr, _ := net.ResolveUDPAddr("udp4", fmt.Sprintf("255.255.255.255:%d", discoveryPort))
					if globalAddr != nil {
						conn.WriteTo(packetBytes, globalAddr)
					}
					conn.Close()
				}
			}
		}
		time.Sleep(3 * time.Second)
	}
}

func listenForBroadcasts() {
	addr, err := net.ResolveUDPAddr("udp4", fmt.Sprintf("0.0.0.0:%d", discoveryPort))
	if err != nil {
		return
	}

	// Wait, if it fails to bind (e.g. another instance is running), we just quietly crash the listener.
	// We could retry if network drops and comes back, but let's stick to standard ListenUDP.
	for {
		conn, err := net.ListenUDP("udp4", addr)
		if err != nil {
			time.Sleep(5 * time.Second) // Retry if port is busy or network stack is initializing
			continue
		}

		buffer := make([]byte, 1024)
		for {
			n, peer, err := conn.ReadFromUDP(buffer)
			if err != nil {
				break // breaks inner loop to re-bind
			}

			var packet DiscoveryPacket
			if err := json.Unmarshal(buffer[:n], &packet); err == nil && packet.DeviceName != "" {
				ip := peer.IP.String()

				// Determine if we actually changed something to trigger UI state.
				mu.Lock()
				d, exists := devices[ip]
				triggerUpdate := false

				if !exists {
					devices[ip] = &DiscoveredDevice{
						IP:         ip,
						DeviceName: packet.DeviceName,
						OS:         packet.OS,
						LastSeen:   time.Now(),
					}
					triggerUpdate = true
				} else {
					d.LastSeen = time.Now()
					if d.DeviceName != packet.DeviceName || d.OS != packet.OS {
						d.DeviceName = packet.DeviceName
						d.OS = packet.OS
						triggerUpdate = true
					}
				}
				mu.Unlock()

				if triggerUpdate {
					notifyChange()
				}
			}
		}
		conn.Close()
	}
}

func pruneStaleDevices() {
	for {
		time.Sleep(5 * time.Second)
		mu.Lock()
		now := time.Now()
		triggerUpdate := false

		for ip, device := range devices {
			if now.Sub(device.LastSeen) > 15*time.Second {
				delete(devices, ip)
				triggerUpdate = true
			}
		}
		mu.Unlock()

		if triggerUpdate {
			notifyChange()
		}
	}
}

func notifyChange() {
	if onChange == nil {
		return
	}
	
	mu.RLock()
	var list []DiscoveredDevice
	for _, dev := range devices {
		list = append(list, *dev)
	}
	mu.RUnlock()

	onChange(list)
}
