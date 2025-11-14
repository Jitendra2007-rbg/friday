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
  apiKey: string;
}

// Add global types here to avoid polluting other files
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;

    webkitAudioContext: typeof AudioContext;
  }
}
