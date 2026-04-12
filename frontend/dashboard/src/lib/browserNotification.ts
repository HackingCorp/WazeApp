export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  if (Notification.permission !== 'denied') {
    return await Notification.requestPermission();
  }
  return Notification.permission;
}

export function showBrowserNotification(
  title: string,
  body: string,
  onClick?: () => void,
): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const notification = new Notification(title, {
    body,
    icon: '/favicon.ico',
    requireInteraction: true,
    tag: `escalation-${Date.now()}`,
  });

  const autoCloseTimer = setTimeout(() => {
    notification.close();
  }, 30000);

  notification.onclick = () => {
    clearTimeout(autoCloseTimer);
    window.focus();
    onClick?.();
    notification.close();
  };
}
