
import React, { useState } from 'react';
import { saveApiKey } from '../utils/apiKeyManager';

interface ApiKeyInputProps {
  onKeySelected: () => void;
}

const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ onKeySelected }) => {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');

  const handleSaveKey = () => {
    if (!apiKey.trim()) {
      setError('API Key cannot be empty.');
      return;
    }
    setError('');
    saveApiKey(apiKey.trim());
    onKeySelected();
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 text-center" style={{backgroundColor: 'var(--bg-primary)'}}>
      <div className="w-full max-w-md p-8 rounded-lg" style={{backgroundColor: 'var(--bg-tertiary)'}}>
        <h1 className="text-2xl font-bold mb-4" style={{color: 'var(--text-primary)'}}>Enter Your Gemini API Key</h1>
        <p className="mb-6" style={{color: 'var(--text-secondary)'}}>
          To use this voice agent, you need to provide your own Google Gemini API key. Your key is stored securely in your browser's local storage and is never sent to our servers.
        </p>
        
        <div className="flex flex-col gap-4">
            <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API Key here"
                className="bg-gray-800 border-2 border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleSaveKey}
              className="w-full font-bold py-3 px-4 rounded-lg transition-colors text-white bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)]"
            >
              Save and Continue
            </button>
        </div>
        
        <p className="text-xs mt-4" style={{color: 'var(--text-muted)'}}>
          You can get a free API key from{' '}
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline" style={{color: 'var(--accent-primary)'}}>
            Google AI Studio
          </a>.
        </p>
      </div>
    </div>
  );
};

export default ApiKeyInput;
