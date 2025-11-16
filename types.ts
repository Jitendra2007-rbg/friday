

export enum AgentStatus {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  LISTENING = 'listening',
  THINKING = 'thinking',
  SPEAKING = 'speaking',
  ERROR = 'error',
}

export interface CalendarEvent {
  id: string;
  title: string;
  dateTime: Date;
}

export interface Alarm {
  id:string;
  label: string;
  time: Date;
}

export interface TranscriptEntry {
  id: string;
  speaker: 'user' | 'agent' | 'system';
  text: string;
}

export interface User {
  id: string;
  email: string | undefined;
  agentName: string;
  profileData?: { [key: string]: any };
  apiKey?: string;
}

export interface UserSettings {
  theme: string;
  voice: string;
  notifications: boolean;
}

// Add global types here to avoid polluting other files
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;

    webkitAudioContext: typeof AudioContext;

    // FIX: Made aistudio optional to resolve declaration conflict error.
    aistudio?: AIStudio;
  }
}