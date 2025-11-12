import React, { useState, useCallback } from 'react';
import AgentInterface from './pages/AgentInterface';
import EventsPage from './pages/EventsPage';
import AlarmsPage from './pages/AlarmsPage';
import { useAgent } from './hooks/useAgent';
import ApiKeyInput from './pages/ApiKeyInput';

const MainApp: React.FC<{ apiKey: string; onApiKeyError: () => void; }> = ({ apiKey, onApiKeyError }) => {
  const [page, setPage] = useState('agent');
  const agentState = useAgent({ apiKey, onApiKeyError });

  const navigate = (newPage: string) => {
    setPage(newPage);
  };

  const renderPage = () => {
    switch (page) {
      case 'events':
        return <EventsPage events={agentState.events} navigate={navigate} />;
      case 'alarms':
        return <AlarmsPage alarms={agentState.alarms} navigate={navigate} />;
      case 'agent':
      default:
        return <AgentInterface agent={agentState} navigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {renderPage()}
    </div>
  );
};

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string | null>(() => localStorage.getItem('gemini-api-key'));
  const [error, setError] = useState<string | null>(null);

  const handleKeySubmit = (key: string) => {
    localStorage.setItem('gemini-api-key', key);
    setApiKey(key);
    setError(null);
  };

  const handleApiKeyError = useCallback(() => {
    localStorage.removeItem('gemini-api-key');
    setApiKey(null);
    setError('Connection failed. Your API key may be invalid or there could be a network issue. Please enter a valid key.');
  }, []);

  if (!apiKey) {
    return <ApiKeyInput onKeySubmit={handleKeySubmit} error={error} />;
  }

  return <MainApp apiKey={apiKey} onApiKeyError={handleApiKeyError} />;
};

export default App;
