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
  id: string;
  label: string;
  time: Date;
  // Fix: The return type of setTimeout in the browser is a number, not NodeJS.Timeout.
  timeoutId: number;
}

export interface TranscriptEntry {
  id: string;
  speaker: 'user' | 'agent' | 'system';
  text: string;
}

// Add global types here to avoid polluting other files
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    webkitAudioContext: typeof AudioContext;
  }
}
