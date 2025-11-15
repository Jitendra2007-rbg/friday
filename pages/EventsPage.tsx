
import React, { useState } from 'react';
import { CalendarEvent } from '../types';
import { CalendarIcon, BackIcon, EditIcon, TrashIcon } from '../components/Icons';

interface EventsPageProps {
  events: CalendarEvent[];
  navigate: (page: string) => void;
  deleteEvent: (id: string) => Promise<void>;
  updateEvent: (id: string, updates: { title: string; dateTime: Date }) => Promise<void>;
}

const EventsPage: React.FC<EventsPageProps> = ({ events, navigate, deleteEvent, updateEvent }) => {
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editFormData, setEditFormData] = useState({ title: '', dateTime: '' });

  const handleEditClick = (event: CalendarEvent) => {
    setEditingEvent(event);
    const localDateTime = new Date(event.dateTime.getTime() - (event.dateTime.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    setEditFormData({ title: event.title, dateTime: localDateTime });
  };

  const handleCancelEdit = () => {
    setEditingEvent(null);
  };

  const handleSaveEdit = async () => {
    if (editingEvent) {
      await updateEvent(editingEvent.id, {
        title: editFormData.title,
        dateTime: new Date(editFormData.dateTime),
      });
      setEditingEvent(null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 font-sans h-full">
      <div className="w-full max-w-2xl rounded-lg p-6" style={{backgroundColor: 'var(--bg-secondary)'}}>
        <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold flex items-center gap-2" style={{color: 'var(--text-secondary)'}}>
              <CalendarIcon className="w-8 h-8"/>
              Your Events
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
        <div className="space-y-3">
          {events.length > 0 ? (
            events.map(event => (
              <div key={event.id} className="p-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-3" style={{backgroundColor: 'var(--bg-tertiary)'}}>
                {editingEvent?.id === event.id ? (
                    <div className="flex-grow w-full flex flex-col md:flex-row gap-2 items-center">
                        <input
                            type="text"
                            name="title"
                            value={editFormData.title}
                            onChange={handleInputChange}
                            className="bg-gray-800 border-2 border-gray-600 rounded-lg p-2 text-white w-full md:w-auto flex-grow focus:outline-none focus:ring-2"
                        />
                        <input
                            type="datetime-local"
                            name="dateTime"
                            value={editFormData.dateTime}
                            onChange={handleInputChange}
                            className="bg-gray-800 border-2 border-gray-600 rounded-lg p-2 text-white w-full md:w-auto focus:outline-none focus:ring-2"
                        />
                    </div>
                ) : (
                    <div className="flex-grow">
                        <p className="font-semibold text-lg text-white">{event.title}</p>
                        <p style={{color: 'var(--text-muted)'}}>{event.dateTime.toLocaleString()}</p>
                    </div>
                )}
                <div className="flex gap-2 self-end md:self-center">
                    {editingEvent?.id === event.id ? (
                        <>
                            <button onClick={handleSaveEdit} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-lg transition-colors">Save</button>
                            <button onClick={handleCancelEdit} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-3 rounded-lg transition-colors">Cancel</button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => handleEditClick(event)}
                                className="text-white p-3 rounded-full transition-colors"
                                style={{backgroundColor: 'var(--accent-primary)'}}
                                aria-label={`Edit event for ${event.title}`}
                            >
                                <EditIcon className="w-5 h-5"/>
                            </button>
                            <button
                                onClick={() => deleteEvent(event.id)}
                                className="text-white p-3 rounded-full transition-colors"
                                style={{backgroundColor: 'var(--danger-primary)'}}
                                aria-label={`Delete event for ${event.title}`}
                            >
                                <TrashIcon className="w-5 h-5"/>
                            </button>
                        </>
                    )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-center py-8" style={{color: 'var(--text-muted)'}}>You have no events scheduled.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default EventsPage;
