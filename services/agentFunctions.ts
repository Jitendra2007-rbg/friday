
import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { User, CalendarEvent, Alarm } from '../types';
import { isNativePlatform, launchAppByUrl } from '../utils/capacitor';
import * as db from './database';

type AddTranscriptFunction = (speaker: 'user' | 'agent' | 'system', text: string) => void;

export const functionDeclarations: FunctionDeclaration[] = [
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
        description: "Generates a high-quality image based on a user's text prompt using the Imagen model."
    },
    {
        name: 'searchProducts',
        parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] },
        description: "Searches for products online on stores like Nike, Amazon, or Flipkart. It provides a price overview and displays images."
    }
];

export const createAgentFunctions = (
    ai: GoogleGenAI,
    user: User,
    addTranscript: AddTranscriptFunction,
    updateUser: (user: User) => void,
    onApiKeyError: () => void
) => {
    const openWebsite = (url: string): string => {
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
    };

    const launchApp = async (appName: string): Promise<string> => {
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
                const openWebsiteResult = openWebsite(result.fallbackUrl);
                return `${result.message} Opening its website instead. ${openWebsiteResult}`;
            }
            return result.message;
        }
    };

    const scheduleEvent = async (title: string, date: string, time: string): Promise<{ message: string; event?: CalendarEvent }> => {
        try {
            if (!user.id) return { message: "I can't schedule an event without a logged-in user."};
            const dateTime = new Date(`${date}T${time}`);
            if (isNaN(dateTime.getTime())) throw new Error("Invalid date or time format.");

            const newEvent = await db.addEvent(user.id, title, dateTime);
            
            if (newEvent) {
                addTranscript('system', `Event Scheduled: "${title}" on ${dateTime.toLocaleString()}`);
                return { message: `Event "${title}" scheduled for ${dateTime.toLocaleString()}.`, event: newEvent };
            }
            return { message: "Failed to save the event. The database did not confirm the action." };
        } catch (error) { 
            console.error("Error in scheduleEvent:", error);
            return { message: "I had a problem scheduling that event. Please check the details or try again." }; 
        }
    };
    
    const setAlarm = async (label: string, time: string): Promise<{ message: string; alarm?: Alarm }> => {
        try {
            if (!user.id) return { message: "I can't set an alarm without a logged-in user."};
            const now = new Date();
            const [hours, minutes] = time.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) throw new Error("Invalid time format.");
    
            const alarmTime = new Date();
            alarmTime.setHours(hours, minutes, 0, 0);
            if (alarmTime <= now) alarmTime.setDate(alarmTime.getDate() + 1);
    
            const newAlarm = await db.addAlarm(user.id, label, alarmTime);
            if (newAlarm) {
                addTranscript('system', `Alarm Set: "${label}" for ${alarmTime.toLocaleTimeString()}`);
                return { message: `Alarm "${label}" set for ${alarmTime.toLocaleTimeString()}.`, alarm: newAlarm };
            }
            return { message: "Failed to save the alarm. The database did not confirm the action." };
        } catch (error) { 
            console.error("Error in setAlarm:", error);
            return { message: "I had a problem setting that alarm. Please check the time or try again." }; 
        }
    };

    const saveUserDetails = async (detailsToSave: { [key: string]: any }): Promise<string> => {
        try {
            const updatedUser = await db.saveUserDetails(user, detailsToSave);
            if (updatedUser) {
                updateUser(updatedUser);
                addTranscript('system', `Saved user details: ${JSON.stringify(detailsToSave)}`);
                return "Got it. I'll remember that.";
            }
            return "I had a problem saving those details.";
        } catch (error) {
            console.error("Error saving user details:", error);
            return "I had a problem saving those details.";
        }
    };

    const generateImage = async (prompt: string): Promise<string> => {
        try {
            addTranscript('system', `Generating image for prompt: "${prompt}"`);
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/png',
                    aspectRatio: '1:1',
                },
            });

            if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image.imageBytes) {
                const base64ImageBytes = response.generatedImages[0].image.imageBytes;
                const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
                addTranscript('agent', `<img src="${imageUrl}" alt="${prompt}" class="max-w-xs rounded-lg" />`);
                return "Here is the image I created for you.";
            } else {
                console.warn("Imagen response did not contain an image:", response);
                return "I couldn't generate an image for that prompt. Please try a different one.";
            }
        } catch (error: any) {
            console.error("Error generating image:", error);
            const errorMessage = error.message || '';
            if (errorMessage.includes('Requested entity was not found') || errorMessage.includes('API key not valid')) {
                onApiKeyError();
                return "There's an issue with the API key. I can't generate an image right now.";
            }
            return "I ran into an error while trying to generate the image.";
        }
    };

    const searchProducts = async (query: string): Promise<string> => {
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
                try {
                    const imageResponse = await ai.models.generateImages({
                        model: 'imagen-4.0-generate-001',
                        prompt: `A professional product shot of ${name} on a clean white background.`,
                        config: {
                            numberOfImages: 1,
                            outputMimeType: 'image/png',
                            aspectRatio: '1:1',
                        },
                    });
                    const imageUrl = imageResponse.generatedImages?.[0]?.image?.imageBytes 
                        ? `data:image/png;base64,${imageResponse.generatedImages[0].image.imageBytes}` 
                        : '';
                    
                    return { 
                        name, 
                        imageUrl,
                        price: 'See Retailer',
                        store: 'Online' 
                    };
                } catch (imgError: any) {
                    console.error(`Failed to generate image for ${name}:`, imgError);
                    // Don't trigger API key error for a single failed image, just return no image.
                    return { name, imageUrl: '', price: 'See Retailer', store: 'Online' };
                }
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
        } catch (error: any) {
            console.error("Error in searchProducts:", error);
            const errorMessage = error.message || '';
            if (errorMessage.includes('Requested entity was not found') || errorMessage.includes('API key not valid')) {
                onApiKeyError();
                return "There's an issue with the API key. I can't search for products right now.";
            }
            const userMessage = `I had some trouble searching for "${query}". The web search may have failed. Please try again.`;
            addTranscript('agent', userMessage);
            return userMessage;
        }
    };
    
    return {
        openWebsite,
        launchApp,
        scheduleEvent,
        setAlarm,
        saveUserDetails,
        generateImage,
        searchProducts,
    };
};
