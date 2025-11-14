
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications';
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
      console.warn('User denied permissions!');
    } else {
        console.log('Push notification permissions granted.');
        // It's good practice to register for push notifications here if you plan to use a service like FCM
        // await PushNotifications.register();
    }
  } else {
    // Web notifications fallback
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }
};

/**
 * Schedules a notification, using native push notifications if available,
 * otherwise falling back to the web Notification API.
 */
export const scheduleNotification = async (notification: { id: number, title: string, body: string }) => {
  if (isNativePlatform()) {
    try {
        await PushNotifications.schedule({
            notifications: [
                {
                    title: notification.title,
                    body: notification.body,
                    id: notification.id,
                    schedule: { at: new Date(Date.now() + 1000) }, // Schedule for 1 second from now
                    sound: 'default',
                    smallIcon: 'res://mipmap-hdpi/ic_launcher.png',
                },
            ],
        });
    } catch (e) {
        console.error("Error scheduling native notification", e);
    }
  } else {
    if (Notification.permission === 'granted') {
      new Notification(notification.title, { body: notification.body, icon: 'favicon.ico' });
    }
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
