
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';

interface ApiKeyContextType {
  isKeyReady: boolean;
  resetApiKeyStatus: () => void;
  selectApiKey: () => Promise<void>;
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
  const [isKeyReady, setIsKeyReady] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const checkKey = useCallback(async () => {
    setIsChecking(true);
    if (window.aistudio) {
        try {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            setIsKeyReady(hasKey);
        } catch (e) {
            console.error("Error checking for API key:", e);
            setIsKeyReady(false);
        }
    } else {
        console.warn('AI Studio context not found. API key features will be disabled.');
        // In a non-AI Studio environment, we can't prompt for a key this way.
        // The error indicates the key isn't set via process.env either, so we default to false.
        setIsKeyReady(false);
    }
    setIsChecking(false);
  }, []);

  useEffect(() => {
    checkKey();
  }, [checkKey]);
  
  const selectApiKey = async () => {
    if (window.aistudio) {
        await window.aistudio.openSelectKey();
        // Optimistically set to true. The app will fail if it's not actually set,
        // and the error handling in API calls will catch it and reset this state.
        setIsKeyReady(true);
    }
  };

  const resetApiKeyStatus = useCallback(() => {
    setIsKeyReady(false);
  }, []);

  const value = { isKeyReady, resetApiKeyStatus, selectApiKey };
  
  if (isChecking) {
    return (
      <div className="h-full flex items-center justify-center" style={{backgroundColor: 'var(--bg-primary)'}}>
        <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <ApiKeyContext.Provider value={value}>
      {children}
    </ApiKeyContext.Provider>
  );
};
