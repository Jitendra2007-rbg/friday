

import { Capacitor } from '@capacitor/core';
import { LocalNotifications, PermissionStatus } from '@capacitor/local-notifications';
import { AppLauncher } from '@capacitor/app-launcher';

export const isNativePlatform = () => Capacitor.isNativePlatform();

export const requestNotificationPermission = async () => {
  if (isNativePlatform()) {
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
    const pending = await LocalNotifications.getPending();
    const notificationsToCancel = pending.notifications.filter(notif => ids.includes(notif.id));
    if (notificationsToCancel.length > 0) {
      await LocalNotifications.cancel({ notifications: notificationsToCancel.map(n => ({ id: n.id })) });
    }
  } catch (e) {
    console.error("Error cancelling native notifications", e);
  }
};

const appUrlSchemes: { [key: string]: { scheme: string; website: string, androidPackage?: string } } = {
    'discord': { scheme: 'discord://', website: 'https://discord.com', androidPackage: 'com.discord' },
    'slack': { scheme: 'slack://', website: 'https://slack.com', androidPackage: 'com.Slack' },
    'twitter': { scheme: 'twitter://', website: 'https://twitter.com', androidPackage: 'com.twitter.android' },
    'x': { scheme: 'twitter://', website: 'https://x.com', androidPackage: 'com.twitter.android' },
    'youtube': { scheme: 'youtube://', website: 'https://youtube.com', androidPackage: 'com.google.android.youtube' },
    'instagram': { scheme: 'instagram://', website: 'https://instagram.com', androidPackage: 'com.instagram.android' },
    'facebook': { scheme: 'fb://', website: 'https://facebook.com', androidPackage: 'com.facebook.katana' },
    'whatsapp': { scheme: 'whatsapp://', website: 'https://whatsapp.com', androidPackage: 'com.whatsapp' },
    'spotify': { scheme: 'spotify://', website: 'https://spotify.com', androidPackage: 'com.spotify.music' },
    'calculator': { scheme: 'calculator://', website: 'https://www.google.com/search?q=calculator', androidPackage: 'com.google.android.calculator' },
};

export const launchAppByUrl = async (appName: string): Promise<{ success: boolean; message: string; fallbackUrl?: string }> => {
    const searchTerm = appName.toLowerCase().trim();
    const appConfig = appUrlSchemes[searchTerm];
    const isAndroidBrowser = /android/i.test(navigator.userAgent);

    if (!appConfig) {
        return { success: false, message: `I don't know how to open "${appName}". I can try searching for it online.` };
    }
    
    if (isNativePlatform()) {
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
    }

    if (isAndroidBrowser && appConfig.androidPackage) {
        window.location.href = `intent://#Intent;scheme=package;package=${appConfig.androidPackage};end`;
        return { success: true, message: `Trying to open ${appName}.`};
    }

    return { success: false, message: `I can't open native apps on this device.`, fallbackUrl: appConfig.website };
};