

import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { BackIcon, CogIcon, PaintBrushIcon, BellIcon, SpeakerWaveIcon, CheckIcon } from '../components/Icons';
import { getSettings, saveSettings } from '../utils/settings';
import { User } from '../types';
import { decode, decodeAudioData } from '../utils/audio';

interface SettingsPageProps {
  navigate: (page: string) => void;
  logout: () => void;
  user: User | null;
}

const themes = [
    { id: 'theme-solar-flare', name: 'Solar Flare' },
    { id: 'theme-starlight', name: 'Starlight' },
    { id: 'theme-cyberpunk-navy', name: 'Cyberpunk Navy' },
];

const voices = [
    { id: 'Zephyr', name: 'Zephyr', description: 'Clear & Friendly' },
    { id: 'Puck', name: 'Puck', description: 'Upbeat & Playful' },
    { id: 'Charon', name: 'Charon', description: 'Deep & Authoritative' },
    { id: 'Kore', name: 'Kore', description: 'Warm & Trustworthy' },
    { id: 'Fenrir', name: 'Fenrir', description: 'Strong & Assertive' },
];

const SettingsPage: React.FC<SettingsPageProps> = ({ navigate, logout, user }) => {
  const [settings, setSettings] = useState(getSettings());
  const [isSaving, setIsSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);

  const handleSettingChange = (key: keyof typeof settings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };
  
  useEffect(() => {
    // Live preview for theme changes
    if (settings.theme) {
       document.documentElement.className = settings.theme;
    }
  }, [settings.theme]);

  const handleSave = () => {
    setIsSaving(true);
    saveSettings(settings);
    setTimeout(() => {
      setIsSaving(false);
    }, 1000);
  };

  const playVoiceSample = async (voiceName: string) => {
    if (!user || isPlaying) return;

    // FIX: Remove API key check and use `process.env.API_KEY` directly per guidelines.
    setIsPlaying(voiceName);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: 'Hello, this is my voice.' }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName } },
                },
            },
        });
        
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            const outputAudioContext = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 24000});
            if (outputAudioContext.state === 'suspended') await outputAudioContext.resume();

            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
            const source = outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputAudioContext.destination);
            source.start();
            source.onended = () => {
                outputAudioContext.close();
                setIsPlaying(null);
            };
        } else {
             setIsPlaying(null);
        }
    } catch (error: any) {
        console.error("Failed to play voice sample:", error);
        const errorMessage = error.message || '';
        if (errorMessage.includes('API key not valid')) {
            alert("The configured API key is invalid.");
        }
        setIsPlaying(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 font-sans h-full">
      <div className="w-full max-w-2xl rounded-lg p-6" style={{backgroundColor: 'var(--bg-secondary)'}}>
        <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-2" style={{color: 'var(--text-secondary)'}}>
              <CogIcon className="w-8 h-8"/>
              Settings
            </h1>
            <button
              onClick={() => navigate('agent')}
              className="flex items-center gap-2 text-white font-bold py-2 px-4 rounded-full transition-colors"
              style={{backgroundColor: 'var(--accent-primary)'}}
              aria-label="Back to main interface"
            >
              <BackIcon className="w-5 h-5"/>
              Back
            </button>
        </div>
        
        <div className="space-y-6">
            {/* Theme Selection */}
            <div>
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-2" style={{color: 'var(--text-secondary)'}}><PaintBrushIcon className="w-5 h-5" /> Theme</h2>
                <div className="grid grid-cols-3 gap-3">
                    {themes.map(theme => (
                        <button key={theme.id} onClick={() => handleSettingChange('theme', theme.id)} className={`p-4 rounded-lg text-center font-semibold border-2 transition-all ${settings.theme === theme.id ? 'border-blue-500 ring-2 ring-blue-500' : 'border-transparent'}`} style={{backgroundColor: `var(--bg-tertiary)`}}>
                            {theme.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Voice Selection */}
            <div>
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-2" style={{color: 'var(--text-secondary)'}}><SpeakerWaveIcon className="w-5 h-5" /> Agent Voice</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     {voices.map(voice => (
                        <div key={voice.id} onClick={() => handleSettingChange('voice', voice.id)} className={`p-4 rounded-lg border-2 transition-all cursor-pointer flex flex-col items-center justify-center text-center ${settings.voice === voice.id ? 'border-blue-500 ring-2 ring-blue-500' : 'border-transparent'}`} style={{backgroundColor: 'var(--bg-tertiary)'}}>
                            <h3 className="font-semibold text-lg">{voice.name}</h3>
                            <p className="text-sm mb-3" style={{color: 'var(--text-muted)'}}>{voice.description}</p>
                            <button 
                                onClick={(e) => { e.stopPropagation(); playVoiceSample(voice.id); }} 
                                disabled={!!isPlaying} 
                                className="p-3 rounded-full disabled:opacity-50 transition-colors hover:bg-gray-600" style={{backgroundColor: 'var(--bg-interactive)'}}>
                                <SpeakerWaveIcon className={`w-6 h-6 ${isPlaying === voice.id ? 'animate-pulse text-green-400' : ''}`}/>
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Notification Toggle */}
            <div>
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-2" style={{color: 'var(--text-secondary)'}}><BellIcon className="w-5 h-5" /> Notifications</h2>
                <div className="flex items-center justify-between p-3 rounded-lg" style={{backgroundColor: `var(--bg-tertiary)`}}>
                    <span>Enable event and alarm notifications</span>
                     <button
                        onClick={() => handleSettingChange('notifications', !settings.notifications)}
                        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${settings.notifications ? 'bg-green-500' : 'bg-gray-600'}`}
                    >
                        <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${settings.notifications ? 'translate-x-6' : 'translate-x-1'}`}/>
                    </button>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col md:flex-row items-center gap-4 pt-4 border-t border-gray-700/50">
                 <button onClick={handleSave} className="w-full md:w-auto flex-grow flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-75" disabled={isSaving}>
                    {isSaving ? 'Saved!' : 'Save Changes'}
                    {isSaving && <CheckIcon className="w-5 h-5" />}
                </button>
                <button onClick={logout} className="w-full md:w-auto text-white font-bold py-3 px-6 rounded-lg transition-colors" style={{backgroundColor: 'var(--danger-primary)'}}>
                    Logout
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;