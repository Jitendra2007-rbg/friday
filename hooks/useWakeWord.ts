
import { useEffect, useRef, useState, useCallback } from 'react';

interface UseWakeWordProps {
    wakeWords: string[];
    onWakeWord: () => void;
    onError: (error: string) => void;
}

// Escapes special characters in a string for use in a regular expression.
const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
};

export const useWakeWord = ({ wakeWords, onWakeWord, onError }: UseWakeWordProps) => {
    const recognitionRef = useRef<any>(null);
    const [isListening, setIsListening] = useState(false);
    const isStoppingRef = useRef(false);
    const wakeWordsRef = useRef(wakeWords);
    const restartTimeoutRef = useRef<number | null>(null);
    
    useEffect(() => {
        wakeWordsRef.current = wakeWords;
    }, [wakeWords]);

    const stopListening = useCallback(() => {
        isStoppingRef.current = true;
        
        if (restartTimeoutRef.current !== null) {
            window.clearTimeout(restartTimeoutRef.current);
            restartTimeoutRef.current = null;
        }

        if (recognitionRef.current) {
            try {
                // Important: remove handlers before stopping to prevent 'onend' loops
                recognitionRef.current.onresult = null;
                recognitionRef.current.onerror = null;
                recognitionRef.current.onend = null;
                recognitionRef.current.stop();
            } catch (e) {
                // Ignore errors when stopping (e.g. if already stopped)
            }
            recognitionRef.current = null;
        }
        setIsListening(false);
    }, []);

    const startListening = useCallback(() => {
        // If already running or explicitly stopped, do not start
        if (recognitionRef.current || isStoppingRef.current) {
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('Voice recognition not supported in this browser.');
            return;
        }
        
        try {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true; // We need this for faster detection
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                setIsListening(true);
            };

            recognition.onresult = (event: any) => {
                // Re-check stop flag in case it changed during processing
                if (isStoppingRef.current) return;

                const currentWakeWords = wakeWordsRef.current;
                const wakeWordRegexes = currentWakeWords.map(word => new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`));

                // Check the latest result
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal || event.results[i][0].confidence > 0.6) {
                        const transcript = event.results[i][0].transcript.trim().toLowerCase();
                        if (wakeWordRegexes.some(regex => regex.test(transcript))) {
                            console.log("Wake word detected:", transcript);
                            stopListening(); // Stop immediately to free up mic
                            onWakeWord();
                            return; 
                        }
                    }
                }
            };
            
            recognition.onerror = (event: any) => {
                // 'no-speech': User didn't speak, just restart.
                // 'aborted': Happened because we stopped it or another app took focus.
                if (event.error === 'no-speech' || event.error === 'aborted') {
                    return; 
                }
                
                console.log('Wake word non-critical error:', event.error);

                if (event.error === 'not-allowed' || event.error === 'audio-capture') {
                    // These are fatal, do not restart
                    isStoppingRef.current = true;
                    setIsListening(false);
                    onError(`Microphone access denied (${event.error}).`);
                }
            };
            
            recognition.onend = () => {
                setIsListening(false);
                recognitionRef.current = null;
                
                // Auto-restart logic
                if (!isStoppingRef.current) {
                    // Add a small delay to prevent rapid crash loops (especially on Android)
                    restartTimeoutRef.current = window.setTimeout(() => {
                        startListening();
                    }, 200); 
                }
            };

            recognitionRef.current = recognition;
            recognition.start();
        } catch (e: any) {
            console.error("Wake word recognition failed to start:", e);
            recognitionRef.current = null;
            setIsListening(false);
        }
    }, [onWakeWord, onError, stopListening]);

    // Explicitly expose a method to enable the listener (sets the flag to false)
    const enableAndStart = useCallback(() => {
        isStoppingRef.current = false;
        startListening();
    }, [startListening]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopListening();
        };
    }, [stopListening]);

    return { startListening: enableAndStart, stopListening, isListening };
};
