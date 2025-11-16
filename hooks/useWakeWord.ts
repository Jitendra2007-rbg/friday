import { useEffect, useRef, useState, useCallback } from 'react';

interface UseWakeWordProps {
    wakeWords: string[];
    onWakeWord: () => void;
    onError: (error: string) => void;
}

export const useWakeWord = ({ wakeWords, onWakeWord, onError }: UseWakeWordProps) => {
    const recognitionRef = useRef<any>(null);
    const [isListening, setIsListening] = useState(false);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.onend = null; // Prevent restart on manual stop
            recognitionRef.current.stop();
            recognitionRef.current = null;
            setIsListening(false);
        }
    }, []);

    const startListening = useCallback(() => {
        if (isListening || recognitionRef.current) {
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            onError('Voice recognition not supported in this browser.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript.trim().toLowerCase();
                if (wakeWords.some(word => transcript.includes(word))) {
                    onWakeWord();
                    // Once wake word is detected, we don't need to process more results.
                    // The `onWakeWord` callback will handle stopping this listener.
                    return;
                }
            }
        };
        
        recognition.onerror = (event: any) => {
            let errorMessage = `Speech recognition error: ${event.error}.`;
            switch (event.error) {
                case 'no-speech':
                    return; // Don't show an error for this, just restart
                case 'audio-capture':
                    errorMessage = 'No microphone found. Ensure a microphone is installed and configured correctly.';
                    break;
                case 'not-allowed':
                    errorMessage = 'Microphone access was denied. Please allow microphone access in your browser settings.';
                    break;
                case 'network':
                    errorMessage = 'A network error occurred with the speech recognition service. Please check your internet connection.';
                    break;
                case 'aborted':
                    return; // Don't restart if aborted
            }
            console.error('Wake word recognition error:', event);
            onError(errorMessage);
        };
        
        recognition.onend = () => {
             // Only restart if it wasn't manually stopped
            if (recognitionRef.current) {
                try {
                    recognition.start();
                } catch(e) {
                    console.error("Could not restart recognition", e);
                    onError('Wake word listener failed to restart.');
                }
            }
        };

        recognitionRef.current = recognition;
        try {
            recognition.start();
            setIsListening(true);
        } catch (e) {
            console.error("Wake word recognition failed to start:", e);
            onError('Wake word listener failed to start.');
            setIsListening(false);
        }
    }, [isListening, wakeWords, onWakeWord, onError]);


    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopListening();
        };
    }, [stopListening]);

    return { startListening, stopListening };
};