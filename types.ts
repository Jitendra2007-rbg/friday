
export enum AgentStatus {
  IDLE = 'idle',
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
}

export interface UserSettings {
  theme: string;
  voice: string;
  notifications: boolean;
}

// Add global types here to avoid polluting other files
declare global {
  // FIX: Defined the AIStudio interface and used it for window.aistudio to resolve a type conflict.
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;

    webkitAudioContext: typeof AudioContext;

    // FIX: Added the `readonly` modifier back to resolve a declaration conflict for `aistudio`.
    readonly aistudio: AIStudio;
  }
}