import React, { useState } from 'react';

interface ApiKeyInputProps {
  onKeySubmit: (key: string) => void;
  error?: string | null;
}

const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ onKeySubmit, error }) => {
  const [apiKey, setApiKey] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) {
      onKeySubmit(apiKey.trim());
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <div className="w-full max-w-md bg-gray-800/50 rounded-lg p-8 shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-2">Gemini Voice Agent</h1>
        <p className="text-center text-gray-400 mb-6">Please enter your Gemini API key to continue.</p>
        
        {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-300 text-sm rounded-lg p-3 mb-4" role="alert">
                {error}
            </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key"
            className="bg-gray-700 border-2 border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="Gemini API Key"
            required
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200"
          >
            Save and Start
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-4 text-center">
          You can get your API key from{' '}
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
            Google AI Studio
          </a>.
          Your key is stored locally in your browser.
        </p>
      </div>
    </div>
  );
};

export default ApiKeyInput;
