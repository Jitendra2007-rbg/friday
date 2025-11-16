

import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { getApiKey, saveApiKey, clearApiKey } from '../utils/apiKeyManager';

interface ApiKeyContextType {
  apiKey: string | null;
  isKeyReady: boolean;
  isStudioEnv: boolean;
  setApiKey: (key: string) => void;
  selectApiKeyInStudio: () => Promise<void>;
  resetApiKeyStatus: () => void;
  loading: boolean;
}

const ApiKeyContext = createContext<ApiKeyContextType | null>(null);

export const useApiKey = () => {
  const context = useContext(ApiKeyContext);
  if (!context) {
    throw new Error('useApiKey must be used within an ApiKeyProvider');
  }
  return context;
};

export const ApiKeyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [isStudioEnv, setIsStudioEnv] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkKey = async () => {
      setLoading(true);
      if (window.aistudio) {
        setIsStudioEnv(true);
        try {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          // In studio, the key is in process.env. We just need to know it's ready.
          setApiKeyState(hasKey ? "STUDIO_KEY_PRESENT" : null);
        } catch (e) {
          console.error("Error checking AI Studio key", e);
          setApiKeyState(null);
        }
      } else {
        setIsStudioEnv(false);
        const storedKey = getApiKey();
        setApiKeyState(storedKey);
      }
      setLoading(false);
    };
    checkKey();
  }, []);

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    if (!isStudioEnv) {
      saveApiKey(key);
    }
  }, [isStudioEnv]);

  const resetApiKeyStatus = useCallback(() => {
    setApiKeyState(null);
    if (!isStudioEnv) {
      clearApiKey();
    }
  }, [isStudioEnv]);

  const selectApiKeyInStudio = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setApiKeyState(hasKey ? "STUDIO_KEY_PRESENT" : null);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{backgroundColor: 'var(--bg-primary)'}}>
        <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }
  
  const value = { apiKey, isKeyReady: !!apiKey, isStudioEnv, setApiKey, selectApiKeyInStudio, resetApiKeyStatus, loading };

  return (
    <ApiKeyContext.Provider value={value}>
      {children}
    </ApiKeyContext.Provider>
  );
};
