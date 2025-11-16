
import { useEffect, useRef, useState, useCallback } from 'react';

interface UseWakeWordProps {
    wakeWords: string[];
    onWakeWord: () => void;
    onError: (error: string) => void;
}

// Escapes special characters in a string for use in a regular expression.
const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
};

export const useWakeWord = ({ wakeWords, onWakeWord, onError }: UseWakeWordProps) => {
    const recognitionRef = useRef<any>(null);
    const [isListening, setIsListening] = useState(false);
    const isStoppingRef = useRef(false);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            isStoppingRef.current = true;
            // Defensively nullify all handlers to prevent them from firing on a stale object.
            recognitionRef.current.onresult = null;
            recognitionRef.current.onerror = null;
            recognitionRef.current.onend = null;
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsListening(false);
    }, []);

    const startListening = useCallback(() => {
        // Rely on the ref as the source of truth for an active session.
        if (recognitionRef.current) {
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            onError('Voice recognition not supported in this browser.');
            return;
        }
        
        isStoppingRef.current = false;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        // Pre-compile an array of regexes from the wake words for efficient and safe matching.
        const wakeWordRegexes = wakeWords.map(word => new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`));

        recognition.onresult = (event: any) => {
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript.trim().toLowerCase();
                if (wakeWordRegexes.some(regex => regex.test(transcript))) {
                    onWakeWord();
                    return; // Stop processing further transcripts once wake word is found.
                }
            }
        };
        
        recognition.onerror = (event: any) => {
            console.error('Wake word recognition error:', event.error, event.message);
            // Non-critical errors that will be recovered by the 'onend' restart logic.
            if (event.error === 'no-speech' || event.error === 'network' || event.error === 'aborted') {
                return; 
            }
            
            // Critical errors that require stopping the listener.
            let errorMessage = `Speech recognition error: ${event.error}.`;
            if (event.error === 'audio-capture') {
                errorMessage = 'No microphone found. Ensure a microphone is installed and configured correctly.';
            } else if (event.error === 'not-allowed') {
                errorMessage = 'Microphone access was denied. Please allow microphone access in your browser settings.';
            }
            
            onError(errorMessage);
            stopListening();
        };
        
        recognition.onend = () => {
            if (isStoppingRef.current) {
                return;
            }
            // Add a longer delay to prevent rapid-fire restarts, especially on network errors.
            setTimeout(() => {
                // Check again in case stopListening was called during the timeout.
                if (!isStoppingRef.current && recognitionRef.current) {
                    try {
                        recognitionRef.current.start();
                    } catch(e) {
                        console.error("Could not restart wake word recognition", e);
                        onError('Wake word listener failed to restart.');
                        stopListening();
                    }
                }
            }, 500);
        };

        recognitionRef.current = recognition;
        try {
            recognition.start();
            setIsListening(true);
        } catch (e: any) {
            console.error("Wake word recognition failed to start:", e);
            onError(`Wake word listener failed to start: ${e.message}`);
            recognitionRef.current = null;
            setIsListening(false);
        }
    }, [wakeWords, onWakeWord, onError, stopListening]);


    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopListening();
        };
    }, [stopListening]);

    return { startListening, stopListening };
};
