import { useState, useRef, useCallback, useEffect } from 'react';
// FIX: The `LiveSession` type is not exported from the '@google/genai' module.
import { GoogleGenAI, FunctionDeclaration, Type, LiveServerMessage, Modality, Blob } from '@google/genai';
import { AgentStatus, CalendarEvent, Alarm, TranscriptEntry } from '../types';
import { decode, encode, decodeAudioData, playAlarmSound } from '../utils/audio';

const WAKE_WORDS = ["hey agent", "hey ridat", "friday", "hey friday", "hey"];

const functionDeclarations: FunctionDeclaration[] = [
    {
        name: 'openWebsite',
        parameters: { type: Type.OBJECT, properties: { url: { type: Type.STRING } }, required: ['url'] },
        description: "Opens a given URL in a new browser tab."
    },
    {
        name: 'launchApp',
        parameters: { type: Type.OBJECT, properties: { appName: { type: Type.STRING } }, required: ['appName'] },
        description: "Launches a desktop application. For example, 'launch Discord'."
    },
    {
        name: 'scheduleEvent',
        parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, date: { type: Type.STRING }, time: { type: Type.STRING } }, required: ['title', 'date', 'time'] },
        description: "Schedules an event. Date should be in YYYY-MM-DD format, time in HH:MM 24-hour format."
    },
    {
        name: 'setAlarm',
        parameters: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, time: { type: Type.STRING } }, required: ['label', 'time'] },
        description: "Sets an alarm. Time should be in HH:MM 24-hour format."
    }
];

export const useAgent = ({ apiKey, onApiKeyError }: { apiKey: string, onApiKeyError: () => void }) => {
    const [agentStatus, setAgentStatus] = useState<AgentStatus>(AgentStatus.IDLE);
    const [transcriptHistory, setTranscriptHistory] = useState<TranscriptEntry[]>([]);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [alarms, setAlarms] = useState<Alarm[]>([]);

    // FIX: The `LiveSession` type is not exported, using `any` for the session object promise.
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const wakeWordRecognitionRef = useRef<any>(null);

    const currentInputTranscription = useRef('');
    const currentOutputTranscription = useRef('');
    const nextStartTime = useRef(0);
    const audioSources = useRef(new Set<AudioBufferSourceNode>());

    const addTranscript = useCallback((speaker: 'user' | 'agent' | 'system', text: string) => {
        setTranscriptHistory(prev => [...prev, { id: Date.now().toString(), speaker, text }]);
    }, []);

    const stopConversation = useCallback(() => {
        if (agentStatus === AgentStatus.IDLE && !sessionPromiseRef.current) return;
        
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        scriptProcessorRef.current?.disconnect();
        inputAudioContextRef.current?.close().catch(console.error);
        outputAudioContextRef.current?.close().catch(console.error);
        sessionPromiseRef.current?.then(session => session.close()).catch(console.error);

        mediaStreamRef.current = null;
        scriptProcessorRef.current = null;
        inputAudioContextRef.current = null;
        outputAudioContextRef.current = null;
        sessionPromiseRef.current = null;

        if (agentStatus !== AgentStatus.ERROR) {
             addTranscript('system', 'Session ended. Say "Hey Agent" to start again.');
        }
        setAgentStatus(AgentStatus.IDLE);
    }, [addTranscript, agentStatus]);

    const startConversation = useCallback(async () => {
        setAgentStatus(AgentStatus.LISTENING);
        if (wakeWordRecognitionRef.current) {
            wakeWordRecognitionRef.current.stop();
        }
        setTranscriptHistory([]);
        addTranscript('system', 'Listening...');
        
        // FIX: Moved agentFunctions inside the callback to prevent stale closures on state setters.
        const agentFunctions = {
            openWebsite: (url: string) => {
                if (!url || typeof url !== 'string') {
                    return "I can't open a website without a valid URL.";
                }
                let fullUrl = url;
                if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
                    fullUrl = `https://${fullUrl}`;
                }
                // Attempt to open the URL directly. Note: This may be blocked by browser pop-up blockers.
                window.open(fullUrl, '_blank');
                addTranscript('system', `Attempting to open: ${fullUrl}`);
                return `Opening ${url} now.`;
            },
            launchApp: (appName: string) => {
                addTranscript('system', `User tried to launch desktop app: ${appName}.`);
                return `As a web-based assistant, I can't open desktop applications directly. However, I can open any website for you.`;
            },
            scheduleEvent: (title: string, date: string, time: string) => {
                try {
                    const dateTime = new Date(`${date}T${time}`);
                    if (isNaN(dateTime.getTime())) throw new Error("Invalid date or time format.");
                    const newEvent: CalendarEvent = { id: Date.now().toString(), title, dateTime };
                    setEvents(prev => [...prev, newEvent].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime()));
                    addTranscript('system', `Event Scheduled: "${title}" on ${dateTime.toLocaleString()}`);
                    return `Event "${title}" scheduled for ${dateTime.toLocaleString()}.`;
                } catch (error) { return "I couldn't schedule that. Please provide the date and time in YYYY-MM-DD and HH:MM format."; }
            },
            setAlarm: (label: string, time: string) => {
                try {
                    const now = new Date();
                    const [hours, minutes] = time.split(':').map(Number);
                    const alarmTime = new Date();
                    alarmTime.setHours(hours, minutes, 0, 0);
                    if (alarmTime <= now) alarmTime.setDate(alarmTime.getDate() + 1);
                    const delay = alarmTime.getTime() - now.getTime();
                    const timeoutId = window.setTimeout(() => {
                        playAlarmSound();
                        addTranscript('system', `ALARM: ${label}`);
                        setAlarms(prev => prev.filter(a => a.timeoutId !== timeoutId));
                    }, delay);
                    const newAlarm: Alarm = { id: Date.now().toString(), label, time: alarmTime, timeoutId };
                    setAlarms(prev => [...prev, newAlarm].sort((a, b) => a.time.getTime() - b.time.getTime()));
                    addTranscript('system', `Alarm Set: "${label}" for ${alarmTime.toLocaleTimeString()}`);
                    return `Alarm "${label}" set for ${alarmTime.toLocaleTimeString()}.`;
                } catch (error) { return "I couldn't set that alarm. Please provide the time in HH:MM format."; }
            },
        };

        try {
            mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            inputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            if (outputAudioContextRef.current.state === 'suspended') {
                await outputAudioContextRef.current.resume();
            }
            nextStartTime.current = 0;

            const ai = new GoogleGenAI({ apiKey });

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    systemInstruction: `You are a helpful and conversational voice assistant named Friday.
                    Your first response in any new conversation MUST be a warm, friendly greeting like 'Hey there, how can I help you?'. Do not wait for the user to speak first; greet them immediately after you are activated.
                    You MUST strictly adhere to speaking English unless the user speaks Telugu. Never use any other languages like Hindi.
                    You MUST operate on Indian Standard Time (IST). When asked for the time or date, provide it in IST. The current date is ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}.
                    Your session should remain active for a long conversation. Do not close the session unless the user says goodbye or is inactive for a very long time.
                    You are a general-purpose assistant. Strive to answer any question the user asks to the best of your ability, even if it's not related to your specific functions.
                    Ensure all your responses are grammatically correct and clearly spoken. Keep your responses conversational and not overly long.
                    If a user's request seems cut off or incomplete, politely ask them to clarify or continue their thought.
                    You can open websites, schedule events, set alarms, and chat.
                    When scheduling events or setting alarms, always confirm the action and the time with the user.`,
                    tools: [{ functionDeclarations }],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {}
                },
                callbacks: {
                    onopen: () => {
                        // Send an initial prompt to trigger the model's greeting based on system instructions.
                        sessionPromiseRef.current?.then((session) => {
                            session.sendRealtimeInput({ text: "[SYSTEM: User has just activated you. Please provide your initial greeting now.]" });
                        });

                        const source = inputAudioContextRef.current!.createMediaStreamSource(mediaStreamRef.current!);
                        scriptProcessorRef.current = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current.onaudioprocess = (event) => {
                            const inputData = event.inputBuffer.getChannelData(0);
                            const pcmBlob: Blob = { data: encode(new Uint8Array(new Int16Array(inputData.map(x => x * 32768)).buffer)), mimeType: 'audio/pcm;rate=16000' };
                            sessionPromiseRef.current?.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
                        };
                        source.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(inputAudioContextRef.current!.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        // FIX: Add a guard clause to prevent errors if the session is closed while a message is being processed.
                        const currentOutputAudioContext = outputAudioContextRef.current;
                        if (!currentOutputAudioContext) {
                            return; // Ignore lingering messages if the session is closed.
                        }

                       if (message.serverContent?.inputTranscription) {
                            const text = message.serverContent.inputTranscription.text;
                            currentInputTranscription.current += text;
                            setTranscriptHistory(prev => {
                                const lastEntry = prev[prev.length - 1];
                                if (lastEntry?.speaker === 'user') {
                                    return [...prev.slice(0, -1), { ...lastEntry, text: currentInputTranscription.current }];
                                }
                                return [...prev, { id: Date.now().toString(), speaker: 'user', text: currentInputTranscription.current }];
                            });
                       }
                       if (message.serverContent?.outputTranscription) {
                            setAgentStatus(AgentStatus.SPEAKING);
                            const text = message.serverContent.outputTranscription.text;
                            currentOutputTranscription.current += text;
                            setTranscriptHistory(prev => {
                               const last = prev[prev.length - 1];
                                if (last && last.speaker === 'agent') {
                                   return [...prev.slice(0, -1), { ...last, text: currentOutputTranscription.current }];
                                }
                                return [...prev, { id: Date.now().toString(), speaker: 'agent', text: currentOutputTranscription.current }];
                            });
                       }
                       if (message.serverContent?.turnComplete) {
                            currentInputTranscription.current = '';
                            currentOutputTranscription.current = '';
                            setAgentStatus(AgentStatus.LISTENING);
                       }

                       if (message.toolCall) {
                            setAgentStatus(AgentStatus.THINKING);
                            for (const fc of message.toolCall.functionCalls) {
                                let result: string;
                                try {
                                    const args = fc.args as Record<string, unknown>;
                                    switch (fc.name) {
                                        case 'openWebsite':
                                            if (typeof args.url === 'string') {
                                                result = agentFunctions.openWebsite(args.url);
                                            } else {
                                                throw new Error('Missing or invalid "url" argument.');
                                            }
                                            break;
                                        case 'launchApp':
                                            if (typeof args.appName === 'string') {
                                                result = agentFunctions.launchApp(args.appName);
                                            } else {
                                                throw new Error('Missing or invalid "appName" argument.');
                                            }
                                            break;
                                        case 'scheduleEvent':
                                            if (typeof args.title === 'string' && typeof args.date === 'string' && typeof args.time === 'string') {
                                                result = agentFunctions.scheduleEvent(args.title, args.date, args.time);
                                            } else {
                                                throw new Error('Missing or invalid arguments for scheduleEvent.');
                                            }
                                            break;
                                        case 'setAlarm':
                                            if (typeof args.label === 'string' && typeof args.time === 'string') {
                                                result = agentFunctions.setAlarm(args.label, args.time);
                                            } else {
                                                throw new Error('Missing or invalid arguments for setAlarm.');
                                            }
                                            break;
                                        default:
                                            throw new Error(`Function "${fc.name}" not found.`);
                                    }
                                } catch (error) {
                                    console.error(`Error executing tool call ${fc.name}:`, error);
                                    result = error instanceof Error ? error.message : "An unknown error occurred while executing the function.";
                                }
        
                                sessionPromiseRef.current?.then((session) => {
                                    session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result } } });
                                });
                            }
                        }
                       const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                       if (base64Audio) {
                            nextStartTime.current = Math.max(nextStartTime.current, currentOutputAudioContext.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), currentOutputAudioContext, 24000, 1);
                            const source = currentOutputAudioContext.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(currentOutputAudioContext.destination);
                            source.addEventListener('ended', () => audioSources.current.delete(source));
                            source.start(nextStartTime.current);
                            nextStartTime.current += audioBuffer.duration;
                            audioSources.current.add(source);
                       }
                       if (message.serverContent?.interrupted) {
                          for (const source of audioSources.current.values()) { source.stop(); }
                          audioSources.current.clear();
                          nextStartTime.current = 0;
                       }
                    },
                    onerror: (e) => {
                        console.error('Gemini Live Error:', e);
                        addTranscript('system', 'A connection error occurred. Your API key might be invalid or there could be a network issue.');
                        setAgentStatus(AgentStatus.ERROR);
                        onApiKeyError();
                    },
                    onclose: () => {
                        stopConversation();
                    },
                },
            });
        } catch (error) {
            console.error("Failed to start conversation:", error);
            addTranscript('system', 'Could not access microphone.');
            setAgentStatus(AgentStatus.ERROR);
        }
    }, [addTranscript, stopConversation, apiKey, onApiKeyError]);
    
    // Effect to manage wake word listener based on agent status
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            addTranscript('system', 'Voice recognition not supported in this browser.');
            return;
        }

        if (agentStatus === AgentStatus.IDLE) {
            if (wakeWordRecognitionRef.current) {
                wakeWordRecognitionRef.current.stop();
            }
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US'; // Prioritize English for wake word detection
            recognition.onresult = (event: any) => {
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        const transcript = event.results[i][0].transcript.trim().toLowerCase();
                        if (WAKE_WORDS.some(word => transcript.includes(word))) {
                            startConversation();
                        }
                    }
                }
            };
            recognition.onerror = (event: any) => {
                if (event.error === 'network') {
                    addTranscript('system', 'Speech recognition failed due to a network error. Please check your internet connection.');
                } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    console.error('Speech recognition error', event.error);
                    addTranscript('system', `Speech recognition error: ${event.error}. Please check microphone permissions.`);
                }
            };
            recognition.onend = () => {
                if (agentStatus === AgentStatus.IDLE) {
                    try { recognition.start(); } catch(e) { console.error("Could not restart recognition", e); }
                }
            };
            wakeWordRecognitionRef.current = recognition;
            try {
                recognition.start();
            } catch (e) {
                console.error("Wake word recognition failed to start:", e);
                addTranscript('system', 'Wake word listener failed to start.');
            }
        } else {
            if (wakeWordRecognitionRef.current) {
                wakeWordRecognitionRef.current.stop();
                wakeWordRecognitionRef.current = null;
            }
        }
        
        return () => {
            if (wakeWordRecognitionRef.current) {
                wakeWordRecognitionRef.current.onend = null;
                wakeWordRecognitionRef.current.stop();
            }
        };
    }, [agentStatus, startConversation, addTranscript]);

    // Initial message effect
    useEffect(() => {
        addTranscript('system', 'Say "Hey Agent", "Hey Ridat", or "Friday" to activate the assistant.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Cleanup alarms on unmount
    useEffect(() => {
        return () => alarms.forEach(alarm => clearTimeout(alarm.timeoutId));
    }, [alarms]);

    // Comprehensive cleanup for all resources on unmount
    useEffect(() => {
        return () => {
            mediaStreamRef.current?.getTracks().forEach(track => track.stop());
            if (scriptProcessorRef.current) {
                scriptProcessorRef.current.disconnect();
                scriptProcessorRef.current = null;
            }
            if(inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
                inputAudioContextRef.current.close().catch(console.error);
            }
            if(outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
                outputAudioContextRef.current.close().catch(console.error);
            }
            sessionPromiseRef.current?.then(session => session.close()).catch(console.error);
            
            if (wakeWordRecognitionRef.current) {
                wakeWordRecognitionRef.current.onend = null;
                wakeWordRecognitionRef.current.onerror = null;
                wakeWordRecognitionRef.current.onresult = null;
                wakeWordRecognitionRef.current.stop();
            }
        };
    }, []);
    
    return { agentStatus, transcriptHistory, events, alarms, startConversation, stopConversation };
};