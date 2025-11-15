

import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, FunctionDeclaration, Type, LiveServerMessage, Modality, Blob } from '@google/genai';
import { AgentStatus, CalendarEvent, Alarm, TranscriptEntry, User } from '../types';
import { decode, encode, decodeAudioData, playAlarmSound } from '../utils/audio';
import { supabase } from '../utils/supabase';
import { isNativePlatform, scheduleNativeNotification, cancelNativeNotifications, launchAppByUrl } from '../utils/capacitor';
import { getSettings } from '../utils/settings';

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
    },
    {
        name: 'saveUserDetails',
        parameters: { type: Type.OBJECT, properties: { detailsToSave: { type: Type.OBJECT, description: "An object containing key-value pairs of user details to remember, such as name, interests, or mood." } }, required: ['detailsToSave'] },
        description: "Saves important details about the user to personalize future conversations."
    },
    {
        name: 'generateImage',
        parameters: { type: Type.OBJECT, properties: { prompt: { type: Type.STRING } }, required: ['prompt'] },
        description: "Generates an image based on a user's text prompt using the nano banana (gemini-2.5-flash-image) model."
    },
    {
        name: 'searchProducts',
        parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] },
        description: "Searches for products online on stores like Nike, Amazon, or Flipkart. It provides a price overview and displays images."
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
    const userRef = useRef(user);

    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const wakeWordRecognitionRef = useRef<any>(null);
    const pendingImageRef = useRef<string | null>(null);

    const WAKE_WORDS = user ? [`hey ${user.agentName.toLowerCase()}`, user.agentName.toLowerCase()] : ['hey friday'];
    const apiKey = user?.apiKey;

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

    const setPendingImage = useCallback((base64: string | null) => {
        pendingImageRef.current = base64;
        if (base64) {
            const imageHtml = `<img src="${base64}" alt="user upload" class="max-w-xs rounded-lg" />`;
            addTranscript('user', imageHtml);
        }
    }, [addTranscript]);

    const deleteAlarm = useCallback(async (id: string) => {
        if (getSettings().notifications && isNativePlatform()) {
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
        if (getSettings().notifications && isNativePlatform()) {
            await cancelNativeNotifications([notificationId]);
        }
        const { data, error } = await supabase.from('alarms').update({ label: updates.label, time: updates.time.toISOString() }).match({ id }).select();
        if (error) {
            console.error('Error updating alarm:', error);
            addTranscript('system', `Failed to update alarm.`);
        } else if (data) {
            setAlarms(prev => prev.map(a => a.id === id ? { ...data[0], id: data[0].id.toString(), time: new Date(data[0].time) } : a).sort((a,b) => a.time.getTime() - b.time.getTime()));
            if (getSettings().notifications && isNativePlatform()) {
                await scheduleNativeNotification({ id: notificationId, title: 'Alarm', body: updates.label, scheduleAt: updates.time });
            }
        }
    }, [addTranscript]);

    const deleteEvent = useCallback(async (id: string) => {
         if (getSettings().notifications && isNativePlatform()) {
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
        if (getSettings().notifications && isNativePlatform()) {
            await cancelNativeNotifications([notificationId]);
        }
        const { data, error } = await supabase.from('events').update({ title: updates.title, dateTime: updates.dateTime.toISOString() }).match({ id }).select();
        if (error) {
            console.error('Error updating event:', error);
            addTranscript('system', `Failed to update event.`);
        } else if (data) {
            setEvents(prev => prev.map(e => e.id === id ? { ...data[0], dateTime: new Date(data[0].dateTime) } : e).sort((a,b) => a.dateTime.getTime() - b.dateTime.getTime()));
            if (getSettings().notifications && isNativePlatform()) {
                await scheduleNativeNotification({ id: notificationId, title: 'Event Reminder', body: updates.title, scheduleAt: updates.dateTime });
            }
        }
    }, [addTranscript]);

    useEffect(() => {
        if (!user) return;
        const syncDataAndNotifications = async () => {
            const { data: eventsData, error: eventsError } = await supabase.from('events').select('*').eq('user_id', user.id).order('dateTime', { ascending: true });
            if (eventsError) console.error('Error fetching events:', eventsError);
            else if (eventsData) {
                const mappedEvents = eventsData.map(e => ({ ...e, dateTime: new Date(e.dateTime) }));
                setEvents(mappedEvents);
                if (getSettings().notifications && isNativePlatform()) {
                    mappedEvents.forEach(event => scheduleNativeNotification({ id: simpleHash(`event-${event.id}`), title: 'Event Reminder', body: event.title, scheduleAt: event.dateTime }));
                }
            }

            const { data: alarmsData, error: alarmsError } = await supabase.from('alarms').select('*').eq('user_id', user.id).order('time', { ascending: true });
            if (alarmsError) console.error('Error fetching alarms:', alarmsError);
            else if (alarmsData) {
                const mappedAlarms = alarmsData.map(a => ({ ...a, id: a.id.toString(), time: new Date(a.time) }));
                setAlarms(mappedAlarms);
                 if (getSettings().notifications && isNativePlatform()) {
                    mappedAlarms.forEach(alarm => scheduleNativeNotification({ id: simpleHash(`alarm-${alarm.id}`), title: 'Alarm', body: alarm.label, scheduleAt: alarm.time }));
                }
            }
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
        pendingImageRef.current = null;

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
        
        const ai = new GoogleGenAI({ apiKey });

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
                if (result.success) {
                    return result.message;
                } else {
                    if (result.fallbackUrl) {
                        addTranscript('system', `App not found, opening website: ${result.fallbackUrl}`);
                        const openWebsiteResult = agentFunctions.openWebsite(result.fallbackUrl);
                        return `${result.message} Opening its website instead. ${openWebsiteResult}`;
                    }
                    return result.message;
                }
            },
            scheduleEvent: async (title: string, date: string, time: string) => {
                try {
                    if (!user || !user.id) return "I can't schedule an event without a logged-in user.";
                    const dateTime = new Date(`${date}T${time}`);
                    if (isNaN(dateTime.getTime())) throw new Error("Invalid date or time format.");
                    
                    const { data, error } = await supabase
                        .from('events')
                        .insert({ title, dateTime: dateTime.toISOString(), user_id: user.id })
                        .select()
                        .single();
            
                    if (error) throw error;
                    
                    if (data) {
                        const newEvent = { ...data, dateTime: new Date(data.dateTime) };
                        setEvents(prev => [...prev, newEvent].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime()));
                        if (getSettings().notifications && isNativePlatform()) {
                           await scheduleNativeNotification({ id: simpleHash(`event-${newEvent.id}`), title: 'Event Reminder', body: newEvent.title, scheduleAt: newEvent.dateTime });
                        }
                        addTranscript('system', `Event Scheduled: "${title}" on ${dateTime.toLocaleString()}`);
                        return `Event "${title}" scheduled for ${dateTime.toLocaleString()}.`;
                    }
                    return "Failed to save the event. The database did not confirm the action.";
                } catch (error) { 
                    console.error("Error in scheduleEvent:", error);
                    return "I had a problem scheduling that event. Please check the details or try again."; 
                }
            },
            setAlarm: async (label: string, time: string) => {
                try {
                    if (!user || !user.id) return "I can't set an alarm without a logged-in user.";
                    const now = new Date();
                    const [hours, minutes] = time.split(':').map(Number);
                    if (isNaN(hours) || isNaN(minutes)) throw new Error("Invalid time format.");
            
                    const alarmTime = new Date();
                    alarmTime.setHours(hours, minutes, 0, 0);
                    if (alarmTime <= now) alarmTime.setDate(alarmTime.getDate() + 1);
            
                    const { data, error } = await supabase
                        .from('alarms')
                        .insert({ label, time: alarmTime.toISOString(), user_id: user.id })
                        .select()
                        .single();
            
                    if (error) throw error;
            
                    if (data) {
                        const newAlarm = { ...data, id: data.id.toString(), time: new Date(data.time) };
                        setAlarms(prev => [...prev, newAlarm].sort((a, b) => a.time.getTime() - b.time.getTime()));
                         if (getSettings().notifications && isNativePlatform()) {
                           await scheduleNativeNotification({ id: simpleHash(`alarm-${newAlarm.id}`), title: 'Alarm', body: newAlarm.label, scheduleAt: newAlarm.time });
                        }
                        addTranscript('system', `Alarm Set: "${label}" for ${alarmTime.toLocaleTimeString()}`);
                        return `Alarm "${label}" set for ${alarmTime.toLocaleTimeString()}.`;
                    }
                    return "Failed to save the alarm. The database did not confirm the action.";
                } catch (error) { 
                    console.error("Error in setAlarm:", error);
                    return "I had a problem setting that alarm. Please check the time or try again."; 
                }
            },
            saveUserDetails: async (detailsToSave: { [key: string]: any }) => {
                const currentUser = userRef.current;
                if (!currentUser) return "I can't save details because I don't know who the user is.";
                try {
                    const currentProfile = currentUser.profileData || {};
                    const newProfileData = { ...currentProfile, ...detailsToSave };
                    
                    const { data, error } = await supabase.auth.updateUser({
                        data: { profileData: newProfileData }
                    });

                    if (error) throw error;
                    
                    if (userRef.current && data.user) {
                        userRef.current = { 
                            ...userRef.current, 
                            profileData: data.user.user_metadata.profileData 
                        };
                    }
                    addTranscript('system', `Saved user details: ${JSON.stringify(detailsToSave)}`);
                    return "Got it. I'll remember that.";
                } catch (error) {
                    console.error("Error saving user details:", error);
                    return "I had a problem saving those details.";
                }
            },
            generateImage: async (prompt: string): Promise<string> => {
                try {
                    addTranscript('system', `Generating image for prompt: "${prompt}"`);
                    const response = await ai.models.generateContent({
                        model: 'gemini-2.5-flash-image',
                        contents: { parts: [{ text: prompt }] },
                        config: { responseModalities: [Modality.IMAGE] },
                    });
                    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
                    if (part?.inlineData?.data) {
                        const base64Image = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                        addTranscript('agent', `<img src="${base64Image}" alt="${prompt}" class="max-w-xs rounded-lg" />`);
                        return "Here is the image I created for you.";
                    } else {
                        return "I couldn't generate an image for that prompt. Please try a different one.";
                    }
                } catch (error) {
                    console.error("Error generating image:", error);
                    return "I ran into an error while trying to generate the image.";
                }
            },
            searchProducts: async (query: string): Promise<string> => {
                try {
                    addTranscript('system', `Searching the web for: "${query}"`);
            
                    const groundedSearchPrompt = `Find a few of the latest and most popular products for the search query "${query}". Describe them for the user in a short summary. Then, on new lines, provide a list of up to 3 of the most relevant product names, each on its own line and prefixed with "PRODUCT:". For example:\n\nHere are some of the latest Nike shoes I found...\nPRODUCT: Nike Air Max 270\nPRODUCT: Nike Pegasus 41`;
            
                    const groundedResponse = await ai.models.generateContent({
                        model: 'gemini-2.5-pro',
                        contents: groundedSearchPrompt,
                        config: { tools: [{ googleSearch: {} }] }
                    });
            
                    const responseText = groundedResponse.text;
                    const summary = responseText.split('PRODUCT:')[0].trim();
                    const productNames = responseText.match(/PRODUCT:(.*)/g)?.map(p => p.replace('PRODUCT:', '').trim()) || [];
            
                    if (productNames.length === 0) {
                        addTranscript('agent', summary || `I searched for "${query}" but couldn't find specific products to display. Here's what I found:`);
                        return summary || `I couldn't find specific product details for "${query}".`;
                    }
            
                    const productResults = await Promise.all(productNames.map(async (name: string) => {
                        const imageResponse = await ai.models.generateContent({
                            model: 'gemini-2.5-flash-image',
                            contents: { parts: [{ text: `A professional product shot of ${name} on a clean white background.` }] },
                            config: { responseModalities: [Modality.IMAGE] },
                        });
                        const part = imageResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
                        const imageUrl = part?.inlineData?.data ? `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` : '';
                        
                        return { 
                            name, 
                            imageUrl,
                            price: 'See Retailer',
                            store: 'Online' 
                        };
                    }));
                    
                    const resultString = `[PRODUCT_RESULTS]${JSON.stringify(productResults)}`;
                    addTranscript('agent', resultString);
            
                    const groundingChunks = groundedResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
                    if (groundingChunks && groundingChunks.length > 0) {
                        const sourcesHtml = groundingChunks.map(chunk => 
                            `<a href="${chunk.web.uri}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-primary); text-decoration: underline; display: block; font-size: 0.8em;">Source: ${chunk.web.title || chunk.web.uri}</a>`
                        ).join('');
                        addTranscript('system', `<div class="text-left"><strong>Sources:</strong> ${sourcesHtml}</div>`);
                    }
            
                    return summary || `I found a few options for "${query}". I'm displaying them for you now.`;
                } catch (error) {
                    console.error("Error in searchProducts:", error);
                    const errorMessage = `I had some trouble searching for "${query}". The web search may have failed. Please try again.`;
                    addTranscript('agent', errorMessage);
                    return errorMessage;
                }
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

            
            const settings = getSettings();
            
            const systemInstruction = `You are a helpful and conversational voice assistant named ${user.agentName}.

            **Core Persona & Behavior:**
            - Your first response in any new conversation MUST be a warm, friendly greeting. If you know the user's name, greet them by name. Otherwise, a general greeting like 'Hey there, how can I help you?' is perfect. Do not wait for the user to speak first; greet them immediately after activation.
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
            - When a user asks you to find a product (e.g., shoes, gadgets), use the 'searchProducts' function. Mention that you'll look on stores like Amazon, Nike, or Flipkart. The function will return product information and you MUST show the user the images and details. Your spoken response should summarize what you found.
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
                        sessionPromiseRef.current?.then((session) => {
                            session.sendRealtimeInput({ text: "[SYSTEM: User has just activated you. Please provide your initial greeting now.]" });
                        });

                        const source = inputAudioContextRef.current!.createMediaStreamSource(mediaStreamRef.current!);
                        scriptProcessorRef.current = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current.onaudioprocess = (event) => {
                            const inputData = event.inputBuffer.getChannelData(0);
                            const pcmBlob: Blob = { data: encode(new Uint8Array(new Int16Array(inputData.map(x => x * 32768)).buffer)), mimeType: 'audio/pcm;rate=16000' };
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
                                        case 'saveUserDetails':
                                            result = typeof args.detailsToSave === 'object' && args.detailsToSave !== null ? await agentFunctions.saveUserDetails(args.detailsToSave) : "Missing user details object.";
                                            break;
                                        case 'generateImage':
                                            result = typeof args.prompt === 'string' ? await agentFunctions.generateImage(args.prompt) : "Missing image prompt.";
                                            break;
                                        case 'searchProducts':
                                            result = typeof args.query === 'string' ? await agentFunctions.searchProducts(args.query) : "Missing product query.";
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
                        addTranscript('system', 'Connection failed. Please check your API key and network. Some browser extensions can also interfere. You have been logged out.');
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

    useEffect(() => {
        if (user) {
            addTranscript('system', `Say "Hey ${user.agentName}" or just "${user.agentName}" to activate the assistant.`);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

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
    
    return { agentStatus, transcriptHistory, events, alarms, startConversation, stopConversation, deleteAlarm, updateAlarm, deleteEvent, updateEvent, setPendingImage };
};
