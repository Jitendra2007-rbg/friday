
import React, { createContext, useState, useEffect, useContext } from 'react';
import { GoogleGenAI } from '@google/genai';
import { useApiKey } from './ApiKeyContext';

interface GeminiContextType {
  ai: GoogleGenAI | null;
}

const GeminiContext = createContext<GeminiContextType | null>(null);

export const useGemini = () => {
  const context = useContext(GeminiContext);
  if (!context) {
    throw new Error('useGemini must be used within a GeminiProvider');
  }
  return context;
};

export const GeminiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { apiKey, isStudioEnv, isKeyReady } = useApiKey();
  const [ai, setAi] = useState<GoogleGenAI | null>(null);

  useEffect(() => {
    if (isKeyReady) {
      try {
        if (isStudioEnv) {
          // As per guidelines, use process.env.API_KEY in the studio environment.
          // This assumes the environment populates it.
          setAi(new GoogleGenAI({ apiKey: process.env.API_KEY }));
        } else if (apiKey) {
          // For browser environment, use the key from storage.
          setAi(new GoogleGenAI({ apiKey }));
        }
      } catch (error) {
         console.error("Failed to initialize GoogleGenAI:", error);
         setAi(null);
      }
    } else {
      setAi(null);
    }
  }, [apiKey, isStudioEnv, isKeyReady]);

  return (
    <GeminiContext.Provider value={{ ai }}>
      {children}
    </GeminiContext.Provider>
  );
};
