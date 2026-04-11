import type { Device } from "../types";

const STORAGE_KEY = "lansync_recent_devices";

/** Loads recent devices from localStorage. */
export function loadRecentDevices(): Device[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

/** Adds a device to the recent list (deduplicates by IP and name), persists to localStorage. */
export function pushToRecentDevices(prev: Device[], device: Device): Device[] {
  const filtered = prev.filter(
    (d) => d.ip !== device.ip && d.deviceName !== device.deviceName,
  );
  const updated = [device, ...filtered].slice(0, 5);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

/** Removes a device from the recent list by IP, persists to localStorage. */
export function removeFromRecentDevices(prev: Device[], ip: string): Device[] {
  const updated = prev.filter((d) => d.ip !== ip);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
