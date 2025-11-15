import { supabase } from '../utils/supabase';
import { User, CalendarEvent, Alarm } from '../types';

// --- User Profile ---
export const saveUserDetails = async (user: User, detailsToSave: { [key: string]: any }): Promise<User | null> => {
    const currentProfile = user.profileData || {};
    const newProfileData = { ...currentProfile, ...detailsToSave };

    const { data, error } = await supabase.auth.updateUser({
        data: { profileData: newProfileData }
    });

    if (error) {
        console.error("Error saving user details:", error);
        throw error;
    }

    if (data.user) {
        return {
            ...user,
            profileData: data.user.user_metadata.profileData
        };
    }
    return null;
};


// --- Events ---
export const getEventsForUser = async (userId: string): Promise<CalendarEvent[]> => {
    const { data, error } = await supabase.from('events').select('*').eq('user_id', userId).order('dateTime', { ascending: true });
    if (error) {
        console.error('Error fetching events:', error);
        return [];
    }
    return data.map(e => ({ ...e, dateTime: new Date(e.dateTime) }));
};

export const addEvent = async (userId: string, title: string, dateTime: Date): Promise<CalendarEvent | null> => {
    const { data, error } = await supabase
        .from('events')
        .insert({ title, dateTime: dateTime.toISOString(), user_id: userId })
        .select()
        .single();
    if (error) {
        console.error("Error adding event:", error);
        return null;
    }
    return data ? { ...data, dateTime: new Date(data.dateTime) } : null;
};

export const deleteEventById = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('events').delete().match({ id });
    if (error) {
        console.error('Error deleting event:', error);
        return false;
    }
    return true;
};

export const updateEventById = async (id: string, updates: { title: string, dateTime: Date }): Promise<CalendarEvent | null> => {
    const { data, error } = await supabase.from('events').update({ title: updates.title, dateTime: updates.dateTime.toISOString() }).match({ id }).select().single();
    if (error) {
        console.error('Error updating event:', error);
        return null;
    }
    return data ? { ...data, dateTime: new Date(data.dateTime) } : null;
};

// --- Alarms ---
export const getAlarmsForUser = async (userId: string): Promise<Alarm[]> => {
    const { data, error } = await supabase.from('alarms').select('*').eq('user_id', userId).order('time', { ascending: true });
    if (error) {
        console.error('Error fetching alarms:', error);
        return [];
    }
    return data.map(a => ({ ...a, id: a.id.toString(), time: new Date(a.time) }));
};

export const addAlarm = async (userId: string, label: string, time: Date): Promise<Alarm | null> => {
    const { data, error } = await supabase
        .from('alarms')
        .insert({ label, time: time.toISOString(), user_id: userId })
        .select()
        .single();
    if (error) {
        console.error("Error adding alarm:", error);
        return null;
    }
    return data ? { ...data, id: data.id.toString(), time: new Date(data.time) } : null;
};

export const deleteAlarmById = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('alarms').delete().match({ id });
    if (error) {
        console.error('Error deleting alarm:', error);
        return false;
    }
    return true;
};

export const updateAlarmById = async (id: string, updates: { label: string, time: Date }): Promise<Alarm | null> => {
    const { data, error } = await supabase.from('alarms').update({ label: updates.label, time: updates.time.toISOString() }).match({ id }).select().single();
    if (error) {
        console.error('Error updating alarm:', error);
        return null;
    }
    return data ? { ...data, id: data.id.toString(), time: new Date(data.time) } : null;
};
