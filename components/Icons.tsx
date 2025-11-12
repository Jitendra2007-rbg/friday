
import React from 'react';

export const MicIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z"></path>
    <path d="M17 11a1 1 0 012 0 7 7 0 01-14 0 1 1 0 012 0 5 5 0 0010 0zM5 21a1 1 0 011-1h12a1 1 0 110 2H6a1 1 0 01-1-1z"></path>
  </svg>
);

export const CalendarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H6zm1 4a1 1 0 011-1h8a1 1 0 110 2H8a1 1 0 01-1-1zm-1 5a1 1 0 001 1h8a1 1 0 100-2H7a1 1 0 00-1 1zm1 4a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd"></path>
  </svg>
);

export const AlarmIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm1 14a1 1 0 11-2 0V8a1 1 0 112 0v8zm-5.657-9.657a1 1 0 010-1.414l.707-.707a1 1 0 111.414 1.414l-.707.707a1 1 0 01-1.414 0zm11.314 0a1 1 0 011.414 0l.707.707a1 1 0 11-1.414 1.414l-.707-.707a1 1 0 010-1.414zM4.929 4.929a1 1 0 011.414 0l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 010-1.414zm12.728 0a1 1 0 010 1.414l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 0z" clipRule="evenodd"></path>
  </svg>
);

export const BackIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" d="M10.707 4.293a1 1 0 010 1.414L5.414 11H20a1 1 0 110 2H5.414l5.293 5.293a1 1 0 01-1.414 1.414l-7-7a1 1 0 010-1.414l7-7a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);
