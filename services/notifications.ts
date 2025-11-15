import { isNativePlatform, scheduleNativeNotification, cancelNativeNotifications } from '../utils/capacitor';
import { getSettings } from '../utils/settings';
import { CalendarEvent, Alarm } from '../types';

// Generates a consistent 32-bit integer ID from a string for notifications.
const simpleHash = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
};

// --- Events ---
export const scheduleEventNotification = async (event: CalendarEvent) => {
    if (getSettings().notifications && isNativePlatform()) {
        await scheduleNativeNotification({ 
            id: simpleHash(`event-${event.id}`), 
            title: 'Event Reminder', 
            body: event.title, 
            scheduleAt: event.dateTime 
        });
    }
};

export const scheduleAllEventNotifications = (events: CalendarEvent[]) => {
    if (getSettings().notifications && isNativePlatform()) {
        events.forEach(scheduleEventNotification);
    }
};

export const cancelEventNotification = async (eventId: string) => {
    if (getSettings().notifications && isNativePlatform()) {
        await cancelNativeNotifications([simpleHash(`event-${eventId}`)]);
    }
};

// --- Alarms ---
export const scheduleAlarmNotification = async (alarm: Alarm) => {
    if (getSettings().notifications && isNativePlatform()) {
        await scheduleNativeNotification({
            id: simpleHash(`alarm-${alarm.id}`),
            title: 'Alarm',
            body: alarm.label,
            scheduleAt: alarm.time
        });
    }
};

export const scheduleAllAlarmNotifications = (alarms: Alarm[]) => {
    if (getSettings().notifications && isNativePlatform()) {
        alarms.forEach(scheduleAlarmNotification);
    }
};

export const cancelAlarmNotification = async (alarmId: string) => {
    if (getSettings().notifications && isNativePlatform()) {
        await cancelNativeNotifications([simpleHash(`alarm-${alarmId}`)]);
    }
};
