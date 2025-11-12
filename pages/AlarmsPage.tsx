import React from 'react';
import { Alarm } from '../types';
import { AlarmIcon, BackIcon } from '../components/Icons';

interface AlarmsPageProps {
  alarms: Alarm[];
  navigate: (page: string) => void;
}

const AlarmsPage: React.FC<AlarmsPageProps> = ({ alarms, navigate }) => {
  return (
    <div className="flex flex-col items-center justify-center p-4 font-sans min-h-screen">
      <div className="w-full max-w-2xl bg-gray-800/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-200">
              <AlarmIcon className="w-8 h-8"/>
              Your Alarms
            </h1>
            <button
              onClick={() => navigate('agent')}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full transition-colors"
              aria-label="Back to main interface"
            >
              <BackIcon className="w-5 h-5"/>
              Back
            </button>
        </div>
        <div className="space-y-3">
          {alarms.length > 0 ? (
            alarms.map(alarm => (
              <div key={alarm.id} className="bg-gray-700/50 p-4 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-semibold text-lg text-white">{alarm.label}</p>
                  <p className="text-gray-400">Set for {alarm.time.toLocaleString()}</p>
                </div>
                <div className="text-2xl font-mono bg-gray-900/50 p-2 rounded-md">
                  {alarm.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))
          ) : (
            <p className="text-center text-gray-400 py-8">You have no alarms set.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlarmsPage;
