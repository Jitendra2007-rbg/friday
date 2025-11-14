
import React, { useState } from 'react';
import { Alarm } from '../types';
import { AlarmIcon, BackIcon, TrashIcon, EditIcon } from '../components/Icons';

interface AlarmsPageProps {
  alarms: Alarm[];
  navigate: (page: string) => void;
  deleteAlarm: (id: string) => void;
  updateAlarm: (id: string, updates: { label: string; time: Date }) => Promise<void>;
}

const AlarmsPage: React.FC<AlarmsPageProps> = ({ alarms, navigate, deleteAlarm, updateAlarm }) => {
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
  const [editFormData, setEditFormData] = useState({ label: '', time: '' });

  const handleEditClick = (alarm: Alarm) => {
    setEditingAlarm(alarm);
    // Format for datetime-local input: YYYY-MM-DDTHH:mm
    const localTime = new Date(alarm.time.getTime() - (alarm.time.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    setEditFormData({ label: alarm.label, time: localTime });
  };

  const handleCancelEdit = () => {
    setEditingAlarm(null);
  };

  const handleSaveEdit = async () => {
    if (editingAlarm) {
      await updateAlarm(editingAlarm.id, {
        label: editFormData.label,
        time: new Date(editFormData.time),
      });
      setEditingAlarm(null);
    }
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

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
              <div key={alarm.id} className="bg-gray-700/50 p-4 rounded-lg flex justify-between items-center transition-all duration-300">
                {editingAlarm?.id === alarm.id ? (
                   <div className="flex-grow flex flex-col md:flex-row gap-2 items-center">
                        <input 
                            type="text"
                            name="label"
                            value={editFormData.label}
                            onChange={handleInputChange}
                            className="bg-gray-800 border-2 border-gray-600 rounded-lg p-2 text-white w-full md:w-auto flex-grow focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                            type="datetime-local"
                            name="time"
                            value={editFormData.time}
                            onChange={handleInputChange}
                            className="bg-gray-800 border-2 border-gray-600 rounded-lg p-2 text-white w-full md:w-auto focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex gap-2 self-end md:self-center">
                            <button onClick={handleSaveEdit} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-lg transition-colors">Save</button>
                            <button onClick={handleCancelEdit} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-3 rounded-lg transition-colors">Cancel</button>
                        </div>
                   </div>
                ) : (
                  <>
                    <div className="flex-grow">
                      <p className="font-semibold text-lg text-white">{alarm.label}</p>
                      <p className="text-gray-400">Set for {alarm.time.toLocaleString()}</p>
                    </div>
                    <div className="text-2xl font-mono bg-gray-900/50 p-2 rounded-md mx-4 hidden md:block">
                      {alarm.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleEditClick(alarm)}
                            className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full transition-colors"
                            aria-label={`Edit alarm for ${alarm.label}`}
                        >
                            <EditIcon className="w-5 h-5"/>
                        </button>
                        <button
                            onClick={() => deleteAlarm(alarm.id)}
                            className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-full transition-colors"
                            aria-label={`Delete alarm for ${alarm.label}`}
                        >
                            <TrashIcon className="w-5 h-5"/>
                        </button>
                    </div>
                  </>
                )}
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
