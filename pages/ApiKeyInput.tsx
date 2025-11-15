
import React from 'react';

interface ApiKeyInputProps {
  onKeySelected: () => void;
}

const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ onKeySelected }) => {
  const handleSelectKey = async () => {
    try {
      await window.aistudio.openSelectKey();
      // Assume success and notify parent to re-render the main app
      onKeySelected();
    } catch (e) {
      console.error("Error opening API key selection dialog:", e);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 text-center" style={{backgroundColor: 'var(--bg-primary)'}}>
      <div className="w-full max-w-md p-8 rounded-lg" style={{backgroundColor: 'var(--bg-tertiary)'}}>
        <h1 className="text-2xl font-bold mb-4" style={{color: 'var(--text-primary)'}}>API Key Required</h1>
        <p className="mb-6" style={{color: 'var(--text-secondary)'}}>
          To use this application, you need to select a Gemini API key. Your key is stored securely and only used to communicate with the Gemini API.
        </p>
        <button
          onClick={handleSelectKey}
          className="w-full font-bold py-3 px-4 rounded-lg transition-colors text-white bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)]"
        >
          Select API Key
        </button>
        <p className="text-xs mt-4" style={{color: 'var(--text-muted)'}}>
          Using the Gemini API may incur costs. Please review the{' '}
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline" style={{color: 'var(--accent-primary)'}}>
            billing documentation
          </a>{' '}
          for details.
        </p>
      </div>
    </div>
  );
};

export default ApiKeyInput;
