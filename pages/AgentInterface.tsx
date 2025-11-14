import React from 'react';
import { AgentStatus, CalendarEvent, Alarm, TranscriptEntry, User } from '../types';
import AgentAvatar from '../components/AgentAvatar';
import { CalendarIcon, AlarmIcon } from '../components/Icons';

interface AgentInterfaceProps {
  agent: {
    agentStatus: AgentStatus;
    transcriptHistory: TranscriptEntry[];
    events: CalendarEvent[];
    alarms: Alarm[];
    startConversation: () => void;
    stopConversation: () => void;
  };
  navigate: (page: string) => void;
  user: User;
  logout: () => void;
}

const AgentInterface: React.FC<AgentInterfaceProps> = ({ agent, navigate, user, logout }) => {
  const {
    agentStatus,
    transcriptHistory,
    events,
    alarms,
    startConversation,
    stopConversation,
  } = agent;

  const isConversationActive = agentStatus !== AgentStatus.IDLE;

  // Function to safely create markup for text with links
  const createMarkup = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const textWithLinks = text.replace(
      urlRegex,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline hover:text-blue-300">$1</a>'
    );
    return { __html: textWithLinks };
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 font-sans min-h-screen">
       <div className="absolute top-4 right-4 flex items-center gap-4 text-sm">
        <div className="text-right">
            <p className="text-gray-300">{user.email}</p>
            <p className="text-gray-500">Agent: {user.agentName}</p>
        </div>
        <button onClick={logout} className="bg-gray-700 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-full transition-colors">
            Logout
        </button>
      </div>

      <div className="w-full max-w-4xl flex flex-col md:flex-row gap-8 mt-16 md:mt-0">
        
        {/* Left Panel - Agent & Status */}
        <div className="flex flex-col items-center justify-center md:w-1/3">
          <AgentAvatar status={agentStatus} />
          <p className="mt-4 text-lg text-gray-400 capitalize">{agentStatus}</p>
          {isConversationActive && agentStatus !== AgentStatus.ERROR &&
            <button onClick={() => stopConversation()} className="mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-full transition-colors">
              End Session
            </button>
          }
          {!isConversationActive &&
            <button onClick={startConversation} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full transition-colors">
             Start Manually
            </button>
          }
        </div>
        
        {/* Right Panel - Information */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="bg-gray-800/50 rounded-lg p-4 h-64 overflow-y-auto" aria-live="polite">
            <h2 className="text-xl font-bold mb-2 text-gray-300">Conversation</h2>
            <div className="space-y-2 text-sm">
              {transcriptHistory.map((entry) => (
                <div key={entry.id} className={`flex ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <p
                    className={`max-w-[80%] p-2 rounded-lg break-words ${
                      entry.speaker === 'user' ? 'bg-blue-600' : 
                      entry.speaker === 'agent' ? 'bg-gray-700' : 'text-center w-full bg-gray-900/50 text-gray-400 italic'
                    }`}
                    dangerouslySetInnerHTML={createMarkup(entry.text)}
                  />
                </div>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div onClick={() => navigate('events')} className="bg-gray-800/50 rounded-lg p-4 cursor-pointer hover:bg-gray-800 transition-colors">
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2 text-gray-300"><CalendarIcon className="w-6 h-6"/> Events</h2>
              <ul className="space-y-1 text-sm text-gray-400">
                {events.length > 0 ? events.slice(0, 3).map(event => (
                  <li key={event.id}>{event.title} - {event.dateTime.toLocaleDateString()}</li>
                )) : <li>No events scheduled.</li>}
                 {events.length > 3 && <li className="text-gray-500">...and {events.length - 3} more</li>}
              </ul>
            </div>
            <div onClick={() => navigate('alarms')} className="bg-gray-800/50 rounded-lg p-4 cursor-pointer hover:bg-gray-800 transition-colors">
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2 text-gray-300"><AlarmIcon className="w-6 h-6"/> Alarms</h2>
              <ul className="space-y-1 text-sm text-gray-400">
                {alarms.length > 0 ? alarms.slice(0, 3).map(alarm => (
                  <li key={alarm.id}>{alarm.label} - {alarm.time.toLocaleTimeString()}</li>
                )) : <li>No alarms set.</li>}
                 {alarms.length > 3 && <li className="text-gray-500">...and {alarms.length - 3} more</li>}
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AgentInterface;