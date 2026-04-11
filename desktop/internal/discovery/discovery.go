package discovery

import (
	"encoding/json"
	"fmt"
	"net"
	"slices"
	"sync"
	"time"
)

type DiscoveryPacket struct {
	DeviceName string `json:"deviceName"`
	OS         string `json:"os"`
	Port       string `json:"port"`
}

type DiscoveredDevice struct {
	IP         string    `json:"ip"`
	DeviceName string    `json:"deviceName"`
	OS         string    `json:"os"`
	LastSeen   time.Time `json:"-"`
}

var (
	devices  = make(map[string]*DiscoveredDevice)
	mu       sync.RWMutex
	onChange func(devices []DiscoveredDevice)
)

const discoveryPort = 34933

func Start(getDeviceName func() string, myOS string, getLocalIPs func() []string, onChangeCallback func(devices []DiscoveredDevice)) {
	onChange = onChangeCallback

	go listenForBroadcasts(getLocalIPs)
	go broadcastPresence(getDeviceName, myOS, getLocalIPs)
	go pruneStaleDevices()
}

func getBroadcastAddresses(getLocalIPs func() []string) []string {
	var addresses []string

	if getLocalIPs != nil {
		for _, ipStr := range getLocalIPs() {
			ip := net.ParseIP(ipStr)
			if ip != nil && ip.To4() != nil {
				ip4 := ip.To4()
				bcastIP := make(net.IP, 4)
				copy(bcastIP, ip4)
				bcastIP[3] = 255
				addresses = append(addresses, bcastIP.String())
			}
		}
	}

	interfaces, err := net.Interfaces()
	if err == nil {
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
						bcastStr := bcastIP.String()

						exists := false
						for _, a := range addresses {
							if a == bcastStr {
								exists = true
								break
							}
						}
						if !exists {
							addresses = append(addresses, bcastStr)
						}
					}
				}
			}
		}
	}

	if len(addresses) == 0 {
		addresses = append(addresses, "255.255.255.255")
	}
	return addresses
}

func broadcastPresence(getDeviceName func() string, myOS string, getLocalIPs func() []string) {
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
				conn, err := net.ListenPacket("udp4", ":0")
				if err == nil {
					bcastAddrs := getBroadcastAddresses(getLocalIPs)
					for _, addr := range bcastAddrs {
						destAddr, _ := net.ResolveUDPAddr("udp4", fmt.Sprintf("%s:%d", addr, discoveryPort))
						if destAddr != nil {
							conn.WriteTo(packetBytes, destAddr)
						}
					}
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

func listenForBroadcasts(getLocalIPs func() []string) {
	addr, err := net.ResolveUDPAddr("udp4", fmt.Sprintf("0.0.0.0:%d", discoveryPort))
	if err != nil {
		return
	}

	for {
		conn, err := net.ListenUDP("udp4", addr)
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}

		buffer := make([]byte, 1024)
		for {
			n, peer, err := conn.ReadFromUDP(buffer)
			if err != nil {
				break
			}

			var packet DiscoveryPacket
			if err := json.Unmarshal(buffer[:n], &packet); err == nil && packet.DeviceName != "" {
				ip := peer.IP.String()

				if getLocalIPs != nil {
					isSelf := slices.Contains(getLocalIPs(), ip)
					if isSelf {
						continue
					}
				}

				mu.Lock()
				d, exists := devices[ip]
				if !exists {
					devices[ip] = &DiscoveredDevice{
						IP:         ip,
						DeviceName: packet.DeviceName,
						OS:         packet.OS,
						LastSeen:   time.Now(),
					}
				} else {
					d.LastSeen = time.Now()
					d.DeviceName = packet.DeviceName
					d.OS = packet.OS
				}
				mu.Unlock()

				notifyChange()
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
