import React from 'react';
import { CalendarEvent } from '../types';
import { CalendarIcon, BackIcon } from '../components/Icons';

interface EventsPageProps {
  events: CalendarEvent[];
  navigate: (page: string) => void;
}

const EventsPage: React.FC<EventsPageProps> = ({ events, navigate }) => {
  return (
    <div className="flex flex-col items-center justify-center p-4 font-sans min-h-screen">
      <div className="w-full max-w-2xl bg-gray-800/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-200">
              <CalendarIcon className="w-8 h-8"/>
              Your Events
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
          {events.length > 0 ? (
            events.map(event => (
              <div key={event.id} className="bg-gray-700/50 p-4 rounded-lg">
                <p className="font-semibold text-lg text-white">{event.title}</p>
                <p className="text-gray-400">{event.dateTime.toLocaleString()}</p>
              </div>
            ))
          ) : (
            <p className="text-center text-gray-400 py-8">You have no events scheduled.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default EventsPage;
