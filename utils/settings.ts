import { UserSettings } from '../types';

const SETTINGS_KEY = 'friday_user_settings';

const defaultSettings: UserSettings = {
  theme: 'theme-cyberpunk-navy',
  voice: 'Zephyr',
  notifications: true,
};

export const getSettings = (): UserSettings => {
  try {
    const storedSettings = localStorage.getItem(SETTINGS_KEY);
    if (storedSettings) {
      return { ...defaultSettings, ...JSON.parse(storedSettings) };
    }
  } catch (error) {
    console.error("Failed to parse settings from localStorage", error);
  }
  return defaultSettings;
};

export const saveSettings = (settings: Partial<UserSettings>) => {
  try {
    const currentSettings = getSettings();
    const newSettings = { ...currentSettings, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    if (settings.theme) {
      applyTheme(settings.theme);
    }
  } catch (error) {
    console.error("Failed to save settings to localStorage", error);
  }
};

export const applyTheme = (theme: string) => {
    document.documentElement.className = theme;
};

// Apply theme on initial load
applyTheme(getSettings().theme);
