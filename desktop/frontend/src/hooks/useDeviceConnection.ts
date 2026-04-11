import { useCallback, useState } from "react";
import {
  AcceptConnection,
  IdentifyDevice,
  RejectConnection,
  RequestConnection,
} from "../../wailsjs/go/main/App";
import type { ConnectionRequest, Device } from "../types";
import { pushToRecentDevices, removeFromRecentDevices } from "../utils/deviceUtils";
import { sendOSNotification } from "../utils/notificationUtils";

type ShowToast = (
  message: string,
  type: "success" | "error",
  path?: string,
) => void;

export function useDeviceConnection(showToast: ShowToast) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDeviceIP, setActiveDeviceIP] = useState<string | null>(null);
  const [newDeviceIP, setNewDeviceIP] = useState<string>("");
  const [pendingRequest, setPendingRequest] =
    useState<ConnectionRequest | null>(null);
  const [recentDevices, setRecentDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);

  const addRecentDevice = useCallback((device: Device) => {
    setRecentDevices((prev) => pushToRecentDevices(prev, device));
  }, []);

  const removeRecentDevice = useCallback((ip: string) => {
    setRecentDevices((prev) => removeFromRecentDevices(prev, ip));
  }, []);

  const connectToDevice = useCallback(
    async (ipToConnect: string = newDeviceIP) => {
      if (!ipToConnect) return;
      setLoading(true);
      try {
        const device: any = await IdentifyDevice(ipToConnect);
        showToast(
          `Asking ${device.deviceName || ipToConnect} to connect...`,
          "success",
        );

        const connectedDeviceName = await RequestConnection(
          device.ip,
          device.port,
        );

        if (connectedDeviceName) {
          device.deviceName = connectedDeviceName;
          setDevices((prev) => {
            if (prev.some((d) => d.ip === device.ip)) return prev;
            return [...prev, device];
          });
          setActiveDeviceIP(device.ip);
          setNewDeviceIP("");
          addRecentDevice(device);
          showToast(
            `Connection established with ${connectedDeviceName}!`,
            "success",
          );
        } else {
          showToast("Connection was declined", "error");
        }
      } catch (err: any) {
        showToast(err.message || String(err), "error");
      } finally {
        setLoading(false);
      }
    },
    [newDeviceIP, showToast, addRecentDevice],
  );

  const handleAcceptConnection = useCallback(() => {
    if (!pendingRequest) return;
    AcceptConnection(pendingRequest.ip);
    const newDevice: Device = {
      ip: pendingRequest.ip,
      port: pendingRequest.port,
      deviceName: pendingRequest.deviceName,
      os: pendingRequest.os,
      type: pendingRequest.type,
    };
    setDevices((prev) => [...prev, newDevice]);
    setActiveDeviceIP(newDevice.ip);
    addRecentDevice(newDevice);
    setPendingRequest(null);
    showToast(`Connected securely to ${newDevice.deviceName}`, "success");
  }, [pendingRequest, showToast, addRecentDevice]);

  const handleRejectConnection = useCallback(() => {
    if (!pendingRequest) return;
    RejectConnection(pendingRequest.ip);
    setPendingRequest(null);
  }, [pendingRequest]);

  // Wire up the incoming connection event from the outside (called by App)
  const onConnectionRequested = useCallback(
    (req: ConnectionRequest) => {
      setPendingRequest(req);
      sendOSNotification(
        "Connection Request",
        `${req.deviceName} wants to connect.`,
      );
    },
    [],
  );

  const onConnectionLost = useCallback(
    (ip: string) => {
      setDevices((prev) => prev.filter((d) => d.ip !== ip));
      setActiveDeviceIP((current) => (current === ip ? null : current));
      showToast("Device got disconnected", "error");
    },
    [showToast],
  );

  return {
    devices,
    setDevices,
    activeDeviceIP,
    setActiveDeviceIP,
    newDeviceIP,
    setNewDeviceIP,
    pendingRequest,
    setPendingRequest,
    recentDevices,
    setRecentDevices,
    loading,
    connectToDevice,
    addRecentDevice,
    removeRecentDevice,
    handleAcceptConnection,
    handleRejectConnection,
    onConnectionRequested,
    onConnectionLost,
  };
}
