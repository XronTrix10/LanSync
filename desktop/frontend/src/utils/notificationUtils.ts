/** Sends a browser/OS notification if permission is granted. */
export function sendOSNotification(title: string, body: string): void {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}
