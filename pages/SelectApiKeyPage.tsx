

import React from 'react';
import { useApiKey } from '../contexts/ApiKeyContext';

const SelectApiKeyPage: React.FC = () => {
  const { selectApiKeyInStudio } = useApiKey();

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 text-center" style={{backgroundColor: 'var(--bg-primary)'}}>
      <div className="w-full max-w-md p-8 rounded-lg" style={{backgroundColor: 'var(--bg-tertiary)'}}>
        <h1 className="text-2xl font-bold mb-4" style={{color: 'var(--text-primary)'}}>Welcome to Friday</h1>
        <p className="mb-6" style={{color: 'var(--text-secondary)'}}>
          To power your voice agent, please select a Google Gemini API key.
          This app may require access to a Google Cloud project with billing enabled for full functionality.
        </p>

        <button
          onClick={selectApiKeyInStudio}
          className="w-full font-bold py-3 px-4 rounded-lg transition-colors text-white bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)]"
        >
          Select API Key
        </button>

        <p className="text-xs mt-4" style={{color: 'var(--text-muted)'}}>
          Need help? Learn more about{' '}
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline" style={{color: 'var(--accent-primary)'}}>
            API billing
          </a>.
        </p>
      </div>
    </div>
  );
};

export default SelectApiKeyPage;