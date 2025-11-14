import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, FunctionDeclaration, Type, LiveServerMessage, Modality, Blob } from '@google/genai';
import { AgentStatus, CalendarEvent, Alarm, TranscriptEntry, User } from '../types';
import { decode, encode, decodeAudioData, playAlarmSound } from '../utils/audio';
import { supabase } from '../utils/supabase';
import { isNativePlatform, scheduleNativeNotification, cancelNativeNotifications, launchAppByUrl } from '../utils/capacitor';

const functionDeclarations: FunctionDeclaration[] = [
    {
        name: 'openWebsite',
        parameters: { type: Type.OBJECT, properties: { url: { type: Type.STRING } }, required: ['url'] },
        description: "Opens a given URL in a new browser tab."
    },
    {
        name: 'launchApp',
        parameters: { type: Type.OBJECT, properties: { appName: { type: Type.STRING } }, required: ['appName'] },
        description: "Launches a native mobile or desktop application. For example, 'launch Discord'."
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

// Generates a consistent 32-bit integer ID from a string for notifications.
const simpleHash = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
};


export const useAgent = ({ user, onApiKeyError }: { user: User | null, onApiKeyError: () => void }) => {
    const [agentStatus, setAgentStatus] = useState<AgentStatus>(AgentStatus.IDLE);
    const [transcriptHistory, setTranscriptHistory] = useState<TranscriptEntry[]>([]);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [alarms, setAlarms] = useState<Alarm[]>([]);

    // The 'LiveSession' type is not exported from '@google/genai', so 'any' is used.
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const wakeWordRecognitionRef = useRef<any>(null);

    const WAKE_WORDS = user ? [`hey ${user.agentName.toLowerCase()}`, user.agentName.toLowerCase()] : ['hey friday'];
    const apiKey = user?.apiKey;

    const currentInputTranscription = useRef('');
    const currentOutputTranscription = useRef('');
    const nextStartTime = useRef(0);
    const audioSources = useRef(new Set<AudioBufferSourceNode>());

    const addTranscript = useCallback((speaker: 'user' | 'agent' | 'system', text: string) => {
        setTranscriptHistory(prev => [...prev, { id: Date.now().toString(), speaker, text }]);
    }, []);

    const deleteAlarm = useCallback(async (id: string) => {
        if (isNativePlatform()) {
            await cancelNativeNotifications([simpleHash(`alarm-${id}`)]);
        }
        const { error } = await supabase.from('alarms').delete().match({ id });
        if (error) {
            console.error('Error deleting alarm:', error);
            addTranscript('system', `Failed to delete alarm.`);
        } else {
            setAlarms(prev => prev.filter(a => a.id !== id));
        }
    }, [addTranscript]);
    
    const updateAlarm = useCallback(async (id: string, updates: { label: string, time: Date }) => {
        const notificationId = simpleHash(`alarm-${id}`);
        if (isNativePlatform()) {
            await cancelNativeNotifications([notificationId]);
        }
        const { data, error } = await supabase.from('alarms').update({ label: updates.label, time: updates.time.toISOString() }).match({ id }).select();
        if (error) {
            console.error('Error updating alarm:', error);
            addTranscript('system', `Failed to update alarm.`);
        } else if (data) {
            setAlarms(prev => prev.map(a => a.id === id ? { ...data[0], id: data[0].id.toString(), time: new Date(data[0].time) } : a).sort((a,b) => a.time.getTime() - b.time.getTime()));
            if (isNativePlatform()) {
                await scheduleNativeNotification({ id: notificationId, title: 'Alarm', body: updates.label, scheduleAt: updates.time });
            }
        }
    }, [addTranscript]);

    const deleteEvent = useCallback(async (id: string) => {
         if (isNativePlatform()) {
            await cancelNativeNotifications([simpleHash(`event-${id}`)]);
        }
        const { error } = await supabase.from('events').delete().match({ id });
        if (error) {
            console.error('Error deleting event:', error);
            addTranscript('system', `Failed to delete event.`);
        } else {
            setEvents(prev => prev.filter(e => e.id !== id));
        }
    }, [addTranscript]);

    const updateEvent = useCallback(async (id: string, updates: { title: string, dateTime: Date }) => {
        const notificationId = simpleHash(`event-${id}`);
        if (isNativePlatform()) {
            await cancelNativeNotifications([notificationId]);
        }
        const { data, error } = await supabase.from('events').update({ title: updates.title, dateTime: updates.dateTime.toISOString() }).match({ id }).select();
        if (error) {
            console.error('Error updating event:', error);
            addTranscript('system', `Failed to update event.`);
        } else if (data) {
            setEvents(prev => prev.map(e => e.id === id ? { ...data[0], dateTime: new Date(data[0].dateTime) } : e).sort((a,b) => a.dateTime.getTime() - b.dateTime.getTime()));
            if (isNativePlatform()) {
                await scheduleNativeNotification({ id: notificationId, title: 'Event Reminder', body: updates.title, scheduleAt: updates.dateTime });
            }
        }
    }, [addTranscript]);

    // Fetch initial data from Supabase and sync notifications
    useEffect(() => {
        if (!user) return;
        const syncDataAndNotifications = async () => {
            const { data: eventsData, error: eventsError } = await supabase.from('events').select('*').eq('user_id', user.id).order('dateTime', { ascending: true });
            if (eventsError) console.error('Error fetching events:', eventsError);
            else if (eventsData) {
                const mappedEvents = eventsData.map(e => ({ ...e, dateTime: new Date(e.dateTime) }));
                setEvents(mappedEvents);
                if (isNativePlatform()) {
                    mappedEvents.forEach(event => scheduleNativeNotification({ id: simpleHash(`event-${event.id}`), title: 'Event Reminder', body: event.title, scheduleAt: event.dateTime }));
                }
            }

            const { data: alarmsData, error: alarmsError } = await supabase.from('alarms').select('*').eq('user_id', user.id).order('time', { ascending: true });
            if (alarmsError) console.error('Error fetching alarms:', alarmsError);
            else if (alarmsData) {
                const mappedAlarms = alarmsData.map(a => ({ ...a, id: a.id.toString(), time: new Date(a.time) }));
                setAlarms(mappedAlarms);
                 if (isNativePlatform()) {
                    mappedAlarms.forEach(alarm => scheduleNativeNotification({ id: simpleHash(`alarm-${alarm.id}`), title: 'Alarm', body: alarm.label, scheduleAt: alarm.time }));
                }
            }
        };
        syncDataAndNotifications();
    }, [user]);

    // Web Fallback: Check for due alarms and events via polling
    useEffect(() => {
        if (isNativePlatform()) return; // This logic is only for web browsers

        const firedNotificationIds = new Set<string>();
        const intervalId = setInterval(() => {
            const now = new Date();
            
            alarms.forEach(alarm => {
                if (new Date(alarm.time) <= now && !firedNotificationIds.has(`alarm-${alarm.id}`)) {
                    new Notification('Alarm', { body: alarm.label, icon: 'favicon.ico' });
                    playAlarmSound();
                    addTranscript('system', `ALARM: ${alarm.label}`);
                    firedNotificationIds.add(`alarm-${alarm.id}`);
                }
            });

            events.forEach(event => {
                if (new Date(event.dateTime) <= now && !firedNotificationIds.has(`event-${event.id}`)) {
                     new Notification('Event Reminder', { body: event.title, icon: 'favicon.ico' });
                    addTranscript('system', `EVENT REMINDER: ${event.title}`);
                    firedNotificationIds.add(`event-${event.id}`);
                }
            });

        }, 5000);

        return () => clearInterval(intervalId);
    }, [alarms, events, addTranscript]);


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
             addTranscript('system', `Session ended. Say "Hey ${user?.agentName || 'Friday'}" to start again.`);
        }
        setAgentStatus(AgentStatus.IDLE);
    }, [addTranscript, agentStatus, user]);

    const startConversation = useCallback(async () => {
        if (!user || !apiKey) {
            addTranscript('system', 'API Key is not configured for this user. Conversation cannot start.');
            setAgentStatus(AgentStatus.ERROR);
            return;
        }
        setAgentStatus(AgentStatus.LISTENING);
        if (wakeWordRecognitionRef.current) {
            wakeWordRecognitionRef.current.stop();
        }
        setTranscriptHistory([]);
        addTranscript('system', 'Listening...');
        
        const agentFunctions = {
            openWebsite: (url: string) => {
                if (!url || typeof url !== 'string') {
                    return "I can't open a website without a valid URL.";
                }
                let fullUrl = url;
                if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
                    fullUrl = `https://${fullUrl}`;
                }
                
                addTranscript('system', `Attempting to open: ${fullUrl}`);
                const newWindow = window.open(fullUrl, '_blank');

                if (newWindow) {
                    return `Opening ${url} now.`;
                } else {
                    return `I couldn't open ${url} directly, as it was likely blocked by a pop-up blocker. I have provided the link in the chat for you to click: ${fullUrl}`;
                }
            },
            launchApp: async (appName: string) => {
                addTranscript('system', `User wants to launch app: ${appName}.`);
                if (!isNativePlatform()) {
                    return `As a web-based assistant, I am running in a browser and cannot launch native desktop or mobile applications. I can open any website for you if you provide the URL.`;
                }
                const result = await launchAppByUrl(appName);
                return result;
            },
            scheduleEvent: async (title: string, date: string, time: string) => {
                try {
                    const dateTime = new Date(`${date}T${time}`);
                    if (isNaN(dateTime.getTime())) throw new Error("Invalid date or time format.");
                    const { data, error } = await supabase.from('events').insert([{ title, dateTime: dateTime.toISOString(), user_id: user.id }]).select();
                    if (error) throw error;
                    
                    if (data && data[0]) {
                        const newEvent = { ...data[0], dateTime: new Date(data[0].dateTime) };
                        setEvents(prev => [...prev, newEvent].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime()));
                        if (isNativePlatform()) {
                           await scheduleNativeNotification({ id: simpleHash(`event-${newEvent.id}`), title: 'Event Reminder', body: newEvent.title, scheduleAt: newEvent.dateTime });
                        }
                        addTranscript('system', `Event Scheduled: "${title}" on ${dateTime.toLocaleString()}`);
                        return `Event "${title}" scheduled for ${dateTime.toLocaleString()}.`;
                    }
                    return "Failed to save the event.";
                } catch (error) { return "I couldn't schedule that. Please provide the date and time in YYYY-MM-DD and HH:MM format."; }
            },
            setAlarm: async (label: string, time: string) => {
                try {
                    const now = new Date();
                    const [hours, minutes] = time.split(':').map(Number);
                    const alarmTime = new Date();
                    alarmTime.setHours(hours, minutes, 0, 0);
                    if (alarmTime <= now) alarmTime.setDate(alarmTime.getDate() + 1);
                    const { data, error } = await supabase.from('alarms').insert([{ label, time: alarmTime.toISOString(), user_id: user.id }]).select();
                    if (error) throw error;

                    if (data && data[0]) {
                        const newAlarm = { ...data[0], id: data[0].id.toString(), time: new Date(data[0].time) };
                        setAlarms(prev => [...prev, newAlarm].sort((a, b) => a.time.getTime() - b.time.getTime()));
                         if (isNativePlatform()) {
                           await scheduleNativeNotification({ id: simpleHash(`alarm-${newAlarm.id}`), title: 'Alarm', body: newAlarm.label, scheduleAt: newAlarm.time });
                        }
                        addTranscript('system', `Alarm Set: "${label}" for ${alarmTime.toLocaleTimeString()}`);
                        return `Alarm "${label}" set for ${alarmTime.toLocaleTimeString()}.`;
                    }
                    return "Failed to save the alarm.";
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
                    systemInstruction: `You are a helpful and conversational voice assistant named ${user.agentName}.
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
                        const currentOutputAudioContext = outputAudioContextRef.current;
                        if (!currentOutputAudioContext) return;

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
                                            result = typeof args.url === 'string' ? agentFunctions.openWebsite(args.url) : "Missing URL.";
                                            break;
                                        case 'launchApp':
                                            result = typeof args.appName === 'string' ? await agentFunctions.launchApp(args.appName) : "Missing App Name.";
                                            break;
                                        case 'scheduleEvent':
                                            result = (typeof args.title === 'string' && typeof args.date === 'string' && typeof args.time === 'string') ? await agentFunctions.scheduleEvent(args.title, args.date, args.time) : "Missing event details.";
                                            break;
                                        case 'setAlarm':
                                            result = (typeof args.label === 'string' && typeof args.time === 'string') ? await agentFunctions.setAlarm(args.label, args.time) : "Missing alarm details.";
                                            break;
                                        default:
                                            result = `Function "${fc.name}" not found.`;
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
    }, [addTranscript, stopConversation, apiKey, onApiKeyError, user]);
    
    // Effect to manage wake word listener
    useEffect(() => {
        if (!user) return;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            addTranscript('system', 'Voice recognition not supported in this browser.');
            return;
        }

        if (agentStatus === AgentStatus.IDLE) {
            if (wakeWordRecognitionRef.current) wakeWordRecognitionRef.current.stop();
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
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
                let errorMessage = `Speech recognition error: ${event.error}.`;
                switch (event.error) {
                    case 'no-speech': return;
                    case 'audio-capture': errorMessage = 'No microphone found. Ensure a microphone is installed and configured correctly.'; break;
                    case 'not-allowed': errorMessage = 'Microphone access was denied. Please allow microphone access in your browser settings.'; break;
                    case 'network': errorMessage = 'A network error occurred with the speech recognition service. Please check your internet connection.'; break;
                    case 'aborted': return;
                }
                console.error('Wake word recognition error:', event);
                addTranscript('system', errorMessage);
            };
            recognition.onend = () => {
                if (agentStatus === AgentStatus.IDLE) {
                    try { recognition.start(); } catch(e) { console.error("Could not restart recognition", e); }
                }
            };
            wakeWordRecognitionRef.current = recognition;
            try { recognition.start(); } catch (e) {
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
    }, [agentStatus, startConversation, addTranscript, user, WAKE_WORDS]);

    // Initial message effect
    useEffect(() => {
        if (user) {
            addTranscript('system', `Say "Hey ${user.agentName}" or just "${user.agentName}" to activate the assistant.`);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

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
    
    return { agentStatus, transcriptHistory, events, alarms, startConversation, stopConversation, deleteAlarm, updateAlarm, deleteEvent, updateEvent };
};