
import React from 'react';
import { AgentStatus } from '../types';
import { MicIcon } from './Icons';

interface AgentAvatarProps {
  status: AgentStatus;
}

const AgentAvatar: React.FC<AgentAvatarProps> = ({ status }) => {
  const getStatusClasses = () => {
    switch (status) {
      case AgentStatus.CONNECTING:
        return 'border-yellow-500 animate-pulse';
      case AgentStatus.LISTENING:
        return 'border-blue-500 animate-pulse';
      case AgentStatus.THINKING:
        return 'border-purple-500 animate-spin';
      case AgentStatus.SPEAKING:
        return 'border-green-500 animate-pulse';
      case AgentStatus.ERROR:
        return 'border-red-500';
      case AgentStatus.IDLE:
      default:
        return 'border-gray-600';
    }
  };

  return (
    <div className={`relative w-40 h-40 md:w-56 md:h-56 rounded-full flex items-center justify-center bg-gray-800 border-4 transition-all duration-300 ${getStatusClasses()}`}>
      <MicIcon className="w-16 h-16 md:w-24 md:h-24 text-gray-400" />
    </div>
  );
};

export default AgentAvatar;