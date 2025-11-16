

export const decode = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const encode = (bytes: Uint8Array): string => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const decodeAudioData = async (
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> => {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32767.0;
    }
  }
  return buffer;
};

export const playAlarmSound = () => {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(console.error);
  }
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.type = 'sine';

  const beepLength = 0.15;
  const beepGap = 0.25;
  let time = audioCtx.currentTime;

  for (let i = 0; i < 8; i++) { // 8 beeps
      oscillator.frequency.setValueAtTime(880, time);
      gainNode.gain.setValueAtTime(0.5, time);
      time += beepLength;
      gainNode.gain.setValueAtTime(0, time);
      time += beepGap;
  }

  oscillator.start();
  oscillator.stop(time);
};

export const playActivationSound = () => {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(console.error);
  }
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.1);
  
  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + 0.15);
  
  oscillator.onended = () => {
    audioCtx.close().catch(console.error);
  };
};