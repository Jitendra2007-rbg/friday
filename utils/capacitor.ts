
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { AppLauncher } from '@capacitor/app-launcher';

export const isNativePlatform = () => Capacitor.isNativePlatform();

/**
 * Manages notification permissions for both native and web platforms.
 */
export const requestNotificationPermission = async () => {
  if (isNativePlatform()) {
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== 'granted') {
      console.warn('User denied permissions for push notifications!');
    } else {
        console.log('Push notification permissions granted.');
    }
  } else {
    // Web notifications fallback
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }
};

/**
 * Schedules a single local notification using the native plugin. This is reliable even if the app is closed.
 */
export const scheduleNativeNotification = async (notification: { id: number, title: string, body: string, scheduleAt: Date }) => {
  if (!isNativePlatform()) return;

  // Do not schedule notifications for past events
  if (notification.scheduleAt.getTime() <= Date.now()) {
    console.log("Skipping schedule for a notification in the past:", notification.title);
    return;
  }

  try {
    await PushNotifications.schedule({
      notifications: [
        {
          title: notification.title,
          body: notification.body,
          id: notification.id,
          schedule: { at: notification.scheduleAt },
          sound: 'default',
          smallIcon: 'res://mipmap-hdpi/ic_launcher.png', // Ensure this icon exists in your android/app/src/main/res folders
        },
      ],
    });
  } catch (e) {
    console.error("Error scheduling native notification", e);
  }
};

/**
 * Cancels pending local notifications by their IDs.
 */
export const cancelNativeNotifications = async (ids: number[]) => {
  if (!isNativePlatform()) return;
  
  try {
    const pending = await PushNotifications.getPending();
    const notificationsToCancel = pending.notifications.filter(notif => ids.includes(notif.id));
    if (notificationsToCancel.length > 0) {
      await PushNotifications.cancel({ notifications: notificationsToCancel });
    }
  } catch (e) {
    console.error("Error cancelling native notifications", e);
  }
};


/**
 * A map of common app names to their URL schemes.
 * This list can be expanded.
 */
const appUrlSchemes: { [key: string]: string } = {
    'discord': 'com.discord', // Android package name
    'slack': 'slack://',
    'twitter': 'twitter://',
    'x': 'twitter://',
    'youtube': 'youtube://',
    'instagram': 'instagram://',
    'facebook': 'fb://',
    'whatsapp': 'whatsapp://',
    'spotify': 'spotify://',
    'calculator': 'com.google.android.calculator' // Example for Android package
};

/**
 * Attempts to launch a native application by its name.
 * @param appName The common name of the app (e.g., "Discord").
 * @returns A string indicating the result of the action.
 */
export const launchAppByUrl = async (appName: string): Promise<string> => {
    const searchTerm = appName.toLowerCase().trim();
    const url = appUrlSchemes[searchTerm];

    if (!url) {
        return `I don't know the URL scheme to open "${appName}". I can only open a few common apps.`;
    }

    try {
        const { completed } = await AppLauncher.openUrl({ url });
        if (completed) {
            return `Opening ${appName}.`;
        } else {
            return `I tried to open ${appName}, but it didn't seem to work.`;
        }
    } catch (error) {
        console.error(`Error launching app ${appName} with URL ${url}:`, error);
        return `I couldn't open "${appName}". Make sure it's installed on your device.`;
    }
};