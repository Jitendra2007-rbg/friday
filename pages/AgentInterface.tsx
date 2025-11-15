
import React from 'react';
import { AgentStatus, CalendarEvent, Alarm, TranscriptEntry, User } from '../types';
import AgentAvatar from '../components/AgentAvatar';
import { CalendarIcon, AlarmIcon, PaperclipIcon, MenuIcon } from '../components/Icons';

interface AgentInterfaceProps {
  agent: {
    agentStatus: AgentStatus;
    transcriptHistory: TranscriptEntry[];
    events: CalendarEvent[];
    alarms: Alarm[];
    startConversation: () => void;
    stopConversation: () => void;
    setPendingImage: (base64: string | null) => void;
  };
  navigate: (page: string) => void;
  user: User;
}

const AgentInterface: React.FC<AgentInterfaceProps> = ({ agent, navigate, user }) => {
  const {
    agentStatus,
    transcriptHistory,
    events,
    alarms,
    startConversation,
    stopConversation,
    setPendingImage,
  } = agent;

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const isConversationActive = agentStatus !== AgentStatus.IDLE;

  const createMarkup = (text: string) => {
    // Already HTML (e.g., from system sources with links)
    if (text.trim().startsWith('<div')) {
      return { __html: text };
    }
    // Add links to plain text
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const textWithLinks = text.replace(
      urlRegex,
      '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: var(--accent-primary); text-decoration: underline;">$1</a>'
    );
    return { __html: textWithLinks };
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setPendingImage(base64String);
      };
      reader.readAsDataURL(file);
    }
    event.target.value = '';
  };

  const ProductCard: React.FC<{ product: { name: string, price: string, store: string, imageUrl: string } }> = ({ product }) => (
    <div className="rounded-lg p-2 flex flex-col items-center text-center transition-all duration-300" style={{backgroundColor: 'var(--bg-tertiary)'}}>
        {product.imageUrl ?
          <img src={product.imageUrl} alt={product.name} className="w-full h-24 object-cover rounded-md mb-2" />
          : <div className="w-full h-24 bg-gray-600 rounded-md mb-2 flex items-center justify-center">?</div>
        }
        <h4 className="font-bold text-xs text-white leading-tight">{product.name}</h4>
        <p className="text-md font-semibold" style={{color: 'var(--accent-primary)'}}>₹{product.price}</p>
        <p className="text-xs" style={{color: 'var(--text-muted)'}}>on {product.store}</p>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center p-4 font-sans h-full relative">
      {/* Mobile Menu */}
      <div className="absolute top-4 left-4 z-20 md:hidden">
          <button onClick={() => setIsMenuOpen(true)} className="p-2 rounded-full hover:bg-gray-700/50 transition-colors">
              <MenuIcon className="w-8 h-8 text-white" />
          </button>
      </div>
      <div className={`fixed top-0 left-0 h-full w-64 p-6 z-30 transform transition-transform duration-300 ease-in-out ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{backgroundColor: 'var(--bg-tertiary)'}}>
          <h2 className="text-2xl font-bold mb-6" style={{color: 'var(--text-secondary)'}}>Menu</h2>
          <nav className="flex flex-col gap-4">
              <button onClick={() => { navigate('events'); setIsMenuOpen(false); }} className="text-left text-lg p-2 rounded-lg hover:bg-gray-700/50 transition-colors flex items-center gap-3"><CalendarIcon className="w-6 h-6"/> Events</button>
              <button onClick={() => { navigate('alarms'); setIsMenuOpen(false); }} className="text-left text-lg p-2 rounded-lg hover:bg-gray-700/50 transition-colors flex items-center gap-3"><AlarmIcon className="w-6 h-6"/> Alarms</button>
          </nav>
      </div>
      {isMenuOpen && <div onClick={() => setIsMenuOpen(false)} className="fixed inset-0 bg-black/60 z-20 md:hidden" />}


      <div className="absolute top-4 right-4 z-10">
         <button onClick={() => navigate('settings')} className="text-right hover:bg-gray-700/50 p-2 rounded-lg transition-colors">
            <p className="font-semibold" style={{color: 'var(--text-secondary)'}}>{user.email}</p>
            <p style={{color: 'var(--text-muted)'}}>Agent: {user.agentName}</p>
        </button>
      </div>

      <div className="w-full max-w-4xl flex flex-col md:flex-row gap-8 mt-16 md:mt-0">
        
        <div className="flex flex-col items-center justify-center md:w-1/3">
          <AgentAvatar status={agentStatus} />
          <p className="mt-4 text-lg capitalize" style={{color: 'var(--text-muted)'}}>{agentStatus}</p>
          {isConversationActive && agentStatus !== AgentStatus.ERROR &&
            <button onClick={() => stopConversation()} className="mt-4 text-white font-bold py-2 px-4 rounded-full transition-colors" style={{backgroundColor: 'var(--danger-primary)', onMouseOver: "this.style.backgroundColor='var(--danger-primary-hover)'"}}>
              End Session
            </button>
          }
          {!isConversationActive &&
            <button onClick={startConversation} className="mt-4 text-white font-bold py-2 px-4 rounded-full transition-colors" style={{backgroundColor: 'var(--accent-primary)', onMouseOver: "this.style.backgroundColor='var(--accent-primary-hover)'"}}>
             Start Manually
            </button>
          }
        </div>
        
        <div className="flex-1 flex flex-col gap-6">
          <div className="relative rounded-lg h-64 flex flex-col" style={{backgroundColor: 'var(--bg-secondary)'}}>
            <h2 className="text-xl font-bold p-4 pb-2 text-center flex-shrink-0" style={{color: 'var(--text-secondary)'}}>Conversation</h2>
            <div className="overflow-y-auto px-4 pb-12 flex-grow" aria-live="polite">
              <div className="space-y-2 text-sm">
                {transcriptHistory.map((entry) => {
                  if (entry.text.startsWith('[PRODUCT_RESULTS]')) {
                    try {
                      const products = JSON.parse(entry.text.replace('[PRODUCT_RESULTS]', ''));
                      return (
                        <div key={entry.id} className="grid grid-cols-2 md:grid-cols-3 gap-3 my-2">
                          {products.map((product: any, index: number) => (
                            <ProductCard key={index} product={product} />
                          ))}
                        </div>
                      );
                    } catch (e) {
                      console.error("Failed to parse product results", e);
                      return <div key={entry.id} className="text-center text-red-400">Error displaying products.</div>;
                    }
                  }

                  // Handle agent-generated images with a download link
                  if (entry.speaker === 'agent' && entry.text.trim().startsWith('<img')) {
                      const srcMatch = entry.text.match(/src="([^"]*)"/);
                      const altMatch = entry.text.match(/alt="([^"]*)"/);
                      const prompt = altMatch ? altMatch[1].replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'ai_generated_image';
                      const filename = `${prompt}.png`;

                      if (srcMatch) {
                          return (
                              <div key={entry.id} className="flex justify-start">
                                  <a href={srcMatch[1]} download={filename} title="Click to download" className="agent-bubble p-2 rounded-lg block" style={{backgroundColor: 'var(--bg-interactive)'}}>
                                      <img src={srcMatch[1]} alt={altMatch ? altMatch[1] : 'Generated Image'} className="max-w-xs rounded-lg" />
                                  </a>
                              </div>
                          );
                      }
                  }
                  
                  const isHtmlSystemMessage = entry.speaker === 'system' && entry.text.trim().startsWith('<');

                  return (
                    <div key={entry.id} className={`flex ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] p-2 rounded-lg break-words ${
                          entry.speaker === 'user' && entry.text.startsWith('<img') ? 'p-0 bg-transparent' : 
                          entry.speaker === 'user' ? 'user-bubble' : 
                          entry.speaker === 'agent' ? 'agent-bubble' : 'system-bubble'
                        }`}
                        style={{
                          backgroundColor: entry.speaker === 'user' ? 'var(--accent-primary)' : entry.speaker === 'agent' ? 'var(--bg-interactive)' : 'transparent',
                          color: entry.speaker === 'system' ? 'var(--text-muted)' : 'var(--text-primary)',
                          textAlign: entry.speaker === 'system' && !isHtmlSystemMessage ? 'center' : 'left',
                          width: entry.speaker === 'system' ? '100%' : 'auto',
                          fontStyle: entry.speaker === 'system' && !isHtmlSystemMessage ? 'italic' : 'normal',
                        }}
                        dangerouslySetInnerHTML={
                          (entry.speaker === 'user' && entry.text.startsWith('<img')) ? {__html: entry.text} : createMarkup(entry.text)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="absolute bottom-2 left-2 z-10">
              <button 
                onClick={() => fileInputRef.current?.click()} 
                title="Attach Image" 
                className="flex items-center gap-2 p-2 rounded-lg text-sm transition-colors hover:bg-opacity-80" 
                style={{backgroundColor: 'var(--bg-interactive)', color: 'var(--text-secondary)'}}
              >
                <PaperclipIcon className="w-5 h-5" />
                <span className="hidden sm:inline">Attach File</span>
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            </div>
          </div>
          
          <div className="hidden md:grid grid-cols-2 gap-6">
            <div onClick={() => navigate('events')} className="rounded-lg p-4 cursor-pointer transition-colors" style={{backgroundColor: 'var(--bg-secondary)'}}>
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2" style={{color: 'var(--text-secondary)'}}><CalendarIcon className="w-6 h-6"/> Events</h2>
              <ul className="space-y-1 text-sm" style={{color: 'var(--text-muted)'}}>
                {events.length > 0 ? events.slice(0, 3).map(event => (
                  <li key={event.id}>{event.title} - {event.dateTime.toLocaleDateString()}</li>
                )) : <li>No events scheduled.</li>}
                 {events.length > 3 && <li>...and {events.length - 3} more</li>}
              </ul>
            </div>
            <div onClick={() => navigate('alarms')} className="rounded-lg p-4 cursor-pointer transition-colors" style={{backgroundColor: 'var(--bg-secondary)'}}>
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2" style={{color: 'var(--text-secondary)'}}><AlarmIcon className="w-6 h-6"/> Alarms</h2>
              <ul className="space-y-1 text-sm" style={{color: 'var(--text-muted)'}}>
                {alarms.length > 0 ? alarms.slice(0, 3).map(alarm => (
                  <li key={alarm.id}>{alarm.label} - {alarm.time.toLocaleTimeString()}</li>
                )) : <li>No alarms set.</li>}
                 {alarms.length > 3 && <li>...and {alarms.length - 3} more</li>}
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AgentInterface;
