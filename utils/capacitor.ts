
import { Capacitor } from '@capacitor/core';
// Fix: Import LocalNotifications for scheduling local notifications, as the methods are not on PushNotifications.
import { LocalNotifications, PermissionStatus } from '@capacitor/local-notifications';
import { AppLauncher } from '@capacitor/app-launcher';

export const isNativePlatform = () => Capacitor.isNativePlatform();

export const requestNotificationPermission = async () => {
  if (isNativePlatform()) {
    // Fix: Use LocalNotifications for permission requests related to local notifications.
    let permStatus: PermissionStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display === 'prompt') {
      permStatus = await LocalNotifications.requestPermissions();
    }
    if (permStatus.display !== 'granted') {
      console.warn('User denied permissions for local notifications!');
    } else {
        console.log('Local notification permissions granted.');
    }
  } else {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }
};

export const scheduleNativeNotification = async (notification: { id: number, title: string, body: string, scheduleAt: Date }) => {
  if (!isNativePlatform()) return;

  if (notification.scheduleAt.getTime() <= Date.now()) {
    console.log("Skipping schedule for a notification in the past:", notification.title);
    return;
  }

  try {
    // Fix: Property 'schedule' does not exist on type 'PushNotificationsPlugin'. Use 'LocalNotifications.schedule' instead.
    await LocalNotifications.schedule({
      notifications: [
        {
          title: notification.title,
          body: notification.body,
          id: notification.id,
          schedule: { at: notification.scheduleAt },
          sound: 'default',
          smallIcon: 'res://mipmap-hdpi/ic_launcher.png',
        },
      ],
    });
  } catch (e) {
    console.error("Error scheduling native notification", e);
  }
};

export const cancelNativeNotifications = async (ids: number[]) => {
  if (!isNativePlatform()) return;
  
  try {
    // Fix: Property 'getPending' does not exist on type 'PushNotificationsPlugin'. Use 'LocalNotifications.getPending' instead.
    const pending = await LocalNotifications.getPending();
    const notificationsToCancel = pending.notifications.filter(notif => ids.includes(notif.id));
    if (notificationsToCancel.length > 0) {
      // Fix: Property 'cancel' does not exist on type 'PushNotificationsPlugin'. Use 'LocalNotifications.cancel' instead.
      // The `cancel` method requires the notification `id` to be a number, not a string.
      await LocalNotifications.cancel({ notifications: notificationsToCancel.map(n => ({ id: n.id })) });
    }
  } catch (e) {
    console.error("Error cancelling native notifications", e);
  }
};

const appUrlSchemes: { [key: string]: { scheme: string; website: string } } = {
    'discord': { scheme: 'discord://', website: 'https://discord.com' },
    'slack': { scheme: 'slack://', website: 'https://slack.com' },
    'twitter': { scheme: 'twitter://', website: 'https://twitter.com' },
    'x': { scheme: 'twitter://', website: 'https://x.com' },
    'youtube': { scheme: 'youtube://', website: 'https://youtube.com' },
    'instagram': { scheme: 'instagram://', website: 'https://instagram.com' },
    'facebook': { scheme: 'fb://', website: 'https://facebook.com' },
    'whatsapp': { scheme: 'whatsapp://', website: 'https://whatsapp.com' },
    'spotify': { scheme: 'spotify://', website: 'https://spotify.com' },
    'calculator': { scheme: 'calculator://', website: 'https://www.google.com/search?q=calculator' }, // iOS scheme
};

export const launchAppByUrl = async (appName: string): Promise<{ success: boolean; message: string; fallbackUrl?: string }> => {
    const searchTerm = appName.toLowerCase().trim();
    const appConfig = appUrlSchemes[searchTerm];

    if (!appConfig) {
        return { success: false, message: `I don't know how to open "${appName}". I can try searching for it online.` };
    }

    try {
        const canOpen = await AppLauncher.canOpenUrl({ url: appConfig.scheme });
        if (canOpen.value) {
            const { completed } = await AppLauncher.openUrl({ url: appConfig.scheme });
            if (completed) {
                return { success: true, message: `Opening ${appName}.` };
            } else {
                return { success: false, message: `I tried to open ${appName}, but it didn't work.`, fallbackUrl: appConfig.website };
            }
        } else {
            return { success: false, message: `It looks like ${appName} is not installed.`, fallbackUrl: appConfig.website };
        }
    } catch (error) {
        console.error(`Error launching app ${appName}:`, error);
        return { success: false, message: `I ran into an error trying to open "${appName}".`, fallbackUrl: appConfig.website };
    }
};
