



import { useState, useRef, useCallback, useEffect } from 'react';
import { LiveServerMessage, Modality, Blob } from '@google/genai';
import { AgentStatus, CalendarEvent, Alarm, TranscriptEntry, User } from '../types';
import { decode, encode, decodeAudioData, playAlarmSound } from '../utils/audio';
import { isNativePlatform } from '../utils/capacitor';
import { getSettings } from '../utils/settings';
import * as db from '../services/database';
import * as notifications from '../services/notifications';
import { functionDeclarations, createAgentFunctions } from '../services/agentFunctions';
import { useWakeWord } from './useWakeWord';
import { useApiKey } from '../contexts/ApiKeyContext';
import { useGemini } from '../contexts/GeminiContext';

const createBlobFromAudio = (data: Float32Array): Blob => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        // Clamp the values to the -1.0 to 1.0 range before conversion
        const s = Math.max(-1, Math.min(1, data[i]));
        // Symmetrically convert to 16-bit signed integer
        int16[i] = s * 32767;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
};

export const useAgent = ({ user }: { user: User | null; }) => {
    const [agentStatus, setAgentStatus] = useState<AgentStatus>(AgentStatus.IDLE);
    const [transcriptHistory, setTranscriptHistory] = useState<TranscriptEntry[]>([]);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [alarms, setAlarms] = useState<Alarm[]>([]);
    const [hasInteracted, setHasInteracted] = useState(false);
    const userRef = useRef(user);
    const { resetApiKeyStatus } = useApiKey();
    const { ai } = useGemini();

    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const pendingImageRef = useRef<string | null>(null);
    const turnInterruptedRef = useRef(false);

    const WAKE_WORDS = user ? [`hey ${user.agentName.toLowerCase()}`, user.agentName.toLowerCase()] : ['hey friday'];

    const currentInputTranscription = useRef('');
    const currentOutputTranscription = useRef('');
    const nextStartTime = useRef(0);
    const audioSources = useRef(new Set<AudioBufferSourceNode>());

     useEffect(() => {
        userRef.current = user;
    }, [user]);

    const addTranscript = useCallback((speaker: 'user' | 'agent' | 'system', text: string) => {
        setTranscriptHistory(prev => [...prev, { id: Date.now().toString(), speaker, text }]);
    }, []);
    
    const handleApiError = useCallback((error: any) => {
        console.error('Gemini API Error:', error);
        const errorMessage = String(error.message || '');
    
        if (errorMessage.includes('API key not valid') || errorMessage.includes('Requested entity was not found')) {
            addTranscript('system', 'The selected API key is invalid or has been revoked. Please select a valid key.');
            resetApiKeyStatus();
        } else if (errorMessage.toLowerCase().includes('failed to fetch')) {
            addTranscript('system', 'Connection to Gemini failed. This could be a network issue, a browser extension blocking the request, or a temporary service outage. Please check your connection and try again.');
        } else {
            addTranscript('system', `A connection error occurred: ${errorMessage}. Please check your network. Some browser extensions can also interfere.`);
        }
        setAgentStatus(AgentStatus.ERROR);
    }, [addTranscript, resetApiKeyStatus]);

    const setPendingImage = useCallback((base64: string | null) => {
        pendingImageRef.current = base64;
        if (base64) {
            const imageHtml = `<img src="${base64}" alt="user upload" class="max-w-xs rounded-lg" />`;
            addTranscript('user', imageHtml);
        }
    }, [addTranscript]);

    const deleteAlarm = useCallback(async (id: string) => {
        await notifications.cancelAlarmNotification(id);
        const success = await db.deleteAlarmById(id);
        if (success) {
            setAlarms(prev => prev.filter(a => a.id !== id));
        } else {
            addTranscript('system', `Failed to delete alarm.`);
        }
    }, [addTranscript]);
    
    const updateAlarm = useCallback(async (id: string, updates: { label: string, time: Date }) => {
        await notifications.cancelAlarmNotification(id);
        const updatedAlarm = await db.updateAlarmById(id, updates);
        if (updatedAlarm) {
            setAlarms(prev => prev.map(a => a.id === id ? updatedAlarm : a).sort((a,b) => a.time.getTime() - b.time.getTime()));
            await notifications.scheduleAlarmNotification(updatedAlarm);
        } else {
            addTranscript('system', `Failed to update alarm.`);
        }
    }, [addTranscript]);

    const deleteEvent = useCallback(async (id: string) => {
         await notifications.cancelEventNotification(id);
        const success = await db.deleteEventById(id);
        if (success) {
            setEvents(prev => prev.filter(e => e.id !== id));
        } else {
            addTranscript('system', `Failed to delete event.`);
        }
    }, [addTranscript]);

    const updateEvent = useCallback(async (id: string, updates: { title: string, dateTime: Date }) => {
        await notifications.cancelEventNotification(id);
        const updatedEvent = await db.updateEventById(id, updates);
        if (updatedEvent) {
            setEvents(prev => prev.map(e => e.id === id ? updatedEvent : e).sort((a,b) => a.dateTime.getTime() - b.dateTime.getTime()));
            await notifications.scheduleEventNotification(updatedEvent);
        } else {
            addTranscript('system', `Failed to update event.`);
        }
    }, [addTranscript]);

    useEffect(() => {
        if (!user) return;
        const syncDataAndNotifications = async () => {
            const userEvents = await db.getEventsForUser(user.id);
            setEvents(userEvents);
            notifications.scheduleAllEventNotifications(userEvents);

            const userAlarms = await db.getAlarmsForUser(user.id);
            setAlarms(userAlarms);
            notifications.scheduleAllAlarmNotifications(userAlarms);
        };
        syncDataAndNotifications();
    }, [user]);

    useEffect(() => {
        if (isNativePlatform()) return; 

        const firedNotificationIds = new Set<string>();
        const intervalId = setInterval(() => {
            if (!getSettings().notifications) return;
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
        
        scriptProcessorRef.current?.disconnect();
        sessionPromiseRef.current?.then(session => session.close()).catch(console.error);

        scriptProcessorRef.current = null;
        sessionPromiseRef.current = null;
        pendingImageRef.current = null;

        // Stop any currently playing audio from the agent.
        for (const source of audioSources.current.values()) {
            source.stop();
        }
        audioSources.current.clear();
        nextStartTime.current = 0;

        if (agentStatus !== AgentStatus.ERROR) {
             addTranscript('system', `Session ended. Say "Hey ${user?.agentName || 'Friday'}" to start again.`);
        }
        setAgentStatus(AgentStatus.IDLE);
    }, [addTranscript, agentStatus, user]);

    const startConversation = useCallback(async () => {
        if (!hasInteracted) {
            setHasInteracted(true);
        }

        if (!ai) {
            handleApiError(new Error("Gemini client is not ready. The API key may be missing or invalid."));
            return;
        }

        setAgentStatus(AgentStatus.CONNECTING);
        
        // --- Centralized Microphone Access ---
        if (!mediaStreamRef.current || !mediaStreamRef.current.active) {
            try {
                mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (error) {
                console.error("Failed to start conversation:", error);
                if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
                    let message = 'Microphone access was denied.';
                    if (navigator.permissions) {
                        try {
                            const permStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
                            if (permStatus.state === 'denied') {
                                message = 'Microphone access has been permanently blocked by your browser. You need to go into your browser\'s site settings to allow it.';
                            } else { 
                                message = 'Please allow microphone access when prompted by your browser.';
                            }
                        } catch (e) {
                            console.warn("Could not query permissions API", e);
                            message = 'Microphone access was denied. Please check your browser settings.';
                        }
                    }
                    addTranscript('system', message);
                } else {
                    addTranscript('system', 'Could not access microphone. Please ensure it is connected and enabled.');
                }
                setAgentStatus(AgentStatus.ERROR);
                return;
            }
        }


        if (!user) {
            addTranscript('system', 'User not logged in. Conversation cannot start.');
            setAgentStatus(AgentStatus.ERROR);
            return;
        }
        
        stopWakeWordListening(); // Stop listening for wake word
        setTranscriptHistory([]);
        addTranscript('system', 'Connecting...');
        
        try {
            const agentFunctions = createAgentFunctions(ai, user, addTranscript, (updatedUser) => {
                if (userRef.current) userRef.current = updatedUser;
            });

            // Ensure audio contexts are created and ready.
            if (!inputAudioContextRef.current || inputAudioContextRef.current.state === 'closed') {
                inputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            }
            if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
                outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            }

            if (inputAudioContextRef.current.state === 'suspended') {
                await inputAudioContextRef.current.resume();
            }
            if (outputAudioContextRef.current.state === 'suspended') {
                await outputAudioContextRef.current.resume();
            }

            nextStartTime.current = 0;
            turnInterruptedRef.current = false;
            
            const settings = getSettings();
            
            const systemInstruction = `You are a helpful and conversational voice assistant named ${user.agentName}.

            **Activation & Greeting:**
            - When you receive the command '[SYSTEM_GREET]', your first and only action MUST be to provide a warm, friendly greeting to the user. Do not wait for them to speak first. If you know their name from the profile data provided below, use it.

            **Core Persona & Behavior:**
            - You MUST operate on Indian Standard Time (IST). When asked for the time or date, provide it in IST. The current date is ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}.
            - Your session should remain active for a long conversation. Do not close the session unless the user says goodbye or is inactive.
            - You can process images sent by the user. If an image is provided, your next response should relate to it.
            - Strive to answer any question to the best of your ability. Keep responses conversational, grammatically correct, and not overly long.
            - If a user's request is unclear, politely ask for clarification.

            **Emotional Intelligence & Empathy:**
            - When a user expresses emotions (e.g., love, fear, joy, sadness), detect the underlying emotional tone.
            - Acknowledge and validate their feelings (e.g., 'It sounds like you're feeling worried—it's okay to feel that way.').
            - Respond with empathy. Offer comfort, support, or gentle humor as appropriate.
            - For anxiety or doubt, use encouraging words. For warmth, respond affectionately but maintain boundaries. For humor, tell a light-hearted joke.
            - If a user expresses distress, suggest helpful resources or actions. Create a safe, supportive space.
            - IMPORTANT BOUNDARY: Never promise a romantic relationship. Clarify that your connection is one of friendship, support, and learning together.

            **Personalization & Memory:**
            - You should try to learn about the user to make conversations better. If you don't know the user's name, age, or primary interests, find a natural moment in the conversation to ask for them.
            - Remember important details the user shares (like their name, mood, education, interests, age). Use the 'saveUserDetails' function to store these key facts. Do NOT save every little detail, only things that are important for building a connection and personalizing future conversations.
            - Here is what you currently know about the user: ${user.profileData ? JSON.stringify(user.profileData) : 'You do not know anything about the user yet.'}. Use this information to make the conversation more personal and relevant. Refer to previous topics for continuity.

            **Functions & Creativity:**
            - You can open websites, launch native mobile apps, schedule events, and set alarms. When scheduling or setting alarms, always confirm the action and time.
            - You can generate images from text descriptions. Use the 'generateImage' function when a user asks you to create, draw, or show them a picture of something.
            - You can search for products (e.g., shoes, gadgets), use the 'searchProducts' function. Mention that you'll look on stores like Amazon, Nike, or Flipkart. The function will return product information and you MUST show the user the images and details. Your spoken response should summarize what you found.
            - You MUST speak and respond ONLY in English. Do not use any other languages like Telugu, Malayalam, or Tamil, regardless of the user's input language.`;

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voice } } },
                    systemInstruction,
                    tools: [{ functionDeclarations }],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {}
                },
                callbacks: {
                    onopen: () => {
                        setAgentStatus(AgentStatus.LISTENING);
                        setTranscriptHistory(prev => {
                            const updatedHistory = [...prev];
                            const lastIndex = updatedHistory.length - 1;
                            if (lastIndex >= 0 && updatedHistory[lastIndex].speaker === 'system' && updatedHistory[lastIndex].text === 'Connecting...') {
                                updatedHistory[lastIndex].text = 'Listening...';
                                return updatedHistory;
                            }
                            return prev;
                        });

                        sessionPromiseRef.current?.then((session) => {
                           session.sendRealtimeInput({ text: "[SYSTEM_GREET]" });
                        });

                        const source = inputAudioContextRef.current!.createMediaStreamSource(mediaStreamRef.current!);
                        scriptProcessorRef.current = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current.onaudioprocess = (event) => {
                            const inputData = event.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlobFromAudio(inputData);
                            sessionPromiseRef.current?.then((session) => {
                                if (pendingImageRef.current) {
                                    const imageBase64 = pendingImageRef.current;
                                    pendingImageRef.current = null;
                                    const mimeType = imageBase64.substring(imageBase64.indexOf(":") + 1, imageBase64.indexOf(";"));
                                    const data = imageBase64.substring(imageBase64.indexOf(",") + 1);
                                    session.sendRealtimeInput({ media: { data, mimeType }});
                                    addTranscript('system', `Image sent to agent.`);
                                }
                                session.sendRealtimeInput({ media: pcmBlob })
                            });
                        };
                        source.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(inputAudioContextRef.current!.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        const currentOutputAudioContext = outputAudioContextRef.current;
                        if (!currentOutputAudioContext) return;

                        if (message.serverContent?.interrupted) {
                            turnInterruptedRef.current = true;
                            for (const source of audioSources.current.values()) { source.stop(); }
                            audioSources.current.clear();
                            nextStartTime.current = 0;
                            currentOutputTranscription.current = '';
                            setAgentStatus(AgentStatus.LISTENING);
                        }

                       if (message.serverContent?.inputTranscription) {
                            const text = message.serverContent.inputTranscription.text;
                            currentInputTranscription.current += text;
                            setTranscriptHistory(prev => {
                                const lastEntry = prev[prev.length - 1];
                                if (lastEntry?.speaker === 'user' && !lastEntry.text.startsWith('<img')) {
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
                                if (last && last.speaker === 'agent' && !last.text.trim().startsWith('<img')) {
                                   return [...prev.slice(0, -1), { ...last, text: currentOutputTranscription.current }];
                                }
                                return [...prev, { id: Date.now().toString(), speaker: 'agent', text: currentOutputTranscription.current }];
                            });
                       }
                       if (message.serverContent?.turnComplete) {
                            currentInputTranscription.current = '';
                            currentOutputTranscription.current = '';
                            setAgentStatus(AgentStatus.LISTENING);
                            turnInterruptedRef.current = false;
                       }

                       if (message.toolCall) {
                            setAgentStatus(AgentStatus.THINKING);
                            turnInterruptedRef.current = false; // New turn with a tool call.

                            for (const fc of message.toolCall.functionCalls) {
                                let result: string | undefined;
                                try {
                                    const args = fc.args as Record<string, any>;
                                    switch (fc.name) {
                                        case 'openWebsite':
                                            result = agentFunctions.openWebsite(args.url);
                                            break;
                                        case 'launchApp':
                                            result = await agentFunctions.launchApp(args.appName);
                                            break;
                                        case 'scheduleEvent': {
                                            const res = await agentFunctions.scheduleEvent(args.title, args.date, args.time);
                                            if (res.event) {
                                                setEvents(prev => [...prev, res.event].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime()));
                                                await notifications.scheduleEventNotification(res.event);
                                            }
                                            result = res.message;
                                            break;
                                        }
                                        case 'setAlarm': {
                                            const res = await agentFunctions.setAlarm(args.label, args.time);
                                            if (res.alarm) {
                                                setAlarms(prev => [...prev, res.alarm].sort((a, b) => a.time.getTime() - b.time.getTime()));
                                                await notifications.scheduleAlarmNotification(res.alarm);
                                            }
                                            result = res.message;
                                            break;
                                        }
                                        case 'saveUserDetails':
                                            result = await agentFunctions.saveUserDetails(args.detailsToSave);
                                            break;
                                        case 'generateImage':
                                            result = await agentFunctions.generateImage(args.prompt);
                                            break;
                                        case 'searchProducts':
                                            result = await agentFunctions.searchProducts(args.query);
                                            break;
                                        default:
                                            result = `Function "${fc.name}" not found.`;
                                    }
                                } catch (error) {
                                    console.error(`Error executing tool call ${fc.name}:`, error);
                                    handleApiError(error);
                                    result = error instanceof Error ? error.message : "An unknown error occurred while executing the function.";
                                }
        
                                // Check for interruption *after* the async agent function has completed.
                                if (turnInterruptedRef.current) {
                                    console.log('Conversation was interrupted during tool execution. Aborting tool response.');
                                    break; 
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
                    },
                    onerror: (e: any) => {
                        handleApiError(e);
                    },
                    onclose: () => {
                        stopConversation();
                    },
                },
            });
        } catch (error) {
            handleApiError(error);
        }
    }, [addTranscript, stopConversation, user, setTranscriptHistory, hasInteracted, handleApiError, ai]);
    
    const { startListening: startWakeWordListening, stopListening: stopWakeWordListening } = useWakeWord({
        wakeWords: WAKE_WORDS,
        onWakeWord: startConversation,
        onError: (error) => addTranscript('system', error),
    });

    useEffect(() => {
        if (agentStatus === AgentStatus.IDLE && hasInteracted) {
            startWakeWordListening();
        } else {
            stopWakeWordListening();
        }
    }, [agentStatus, startWakeWordListening, stopWakeWordListening, hasInteracted]);

    useEffect(() => {
        if (user && hasInteracted) {
            addTranscript('system', `Say "Hey ${user.agentName}" or just "${user.agentName}" to activate the assistant.`);
        } else if (user && !hasInteracted) {
            addTranscript('system', `Click "Start Manually" to begin the conversation.`);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, hasInteracted]);

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
        };
    }, []);
    
    return { agentStatus, transcriptHistory, events, alarms, startConversation, stopConversation, deleteAlarm, updateAlarm, deleteEvent, updateEvent, setPendingImage };
};