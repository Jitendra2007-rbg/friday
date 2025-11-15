const API_KEY_STORAGE_KEY = 'gemini_user_api_key';

export const saveApiKey = (key: string): void => {
  try {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
  } catch (error) {
    console.error("Failed to save API key to localStorage", error);
  }
};

export const getApiKey = (): string | null => {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to get API key from localStorage", error);
    return null;
  }
};

export const hasApiKey = (): boolean => {
  return getApiKey() !== null;
};

export const clearApiKey = (): void => {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear API key from localStorage", error);
  }
};
