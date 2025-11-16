

import React, { useState, useEffect, createContext, useContext } from 'react';
import AgentInterface from './pages/AgentInterface';
import EventsPage from './pages/EventsPage';
import AlarmsPage from './pages/AlarmsPage';
import { useAgent } from './hooks/useAgent';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import { supabase } from './utils/supabase';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { User } from './types';
import { requestNotificationPermission } from './utils/capacitor';
import SettingsPage from './pages/SettingsPage';
import './utils/settings'; // Applies theme on initial load

interface AuthContextType {
  session: Session | null;
  user: User | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const fetchUserProfile = async (sessionUser: SupabaseUser): Promise<User | null> => {
  // The user's dynamic profile (name, interests, etc.) is stored in user_metadata.
  const profileData = sessionUser.user_metadata?.profileData || {};

  // Core agent config is stored in the public users table.
  const { data: userData, error } = await supabase
    .from('users')
    .select('agent_name')
    .eq('id', sessionUser.id)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user profile:", error.message);
    return null;
  }

  if (userData) {
    return {
      id: sessionUser.id,
      email: sessionUser.email,
      agentName: userData.agent_name || 'Friday',
      profileData: profileData,
    };
  }
  
  // Fallback for new users whose profile might not have been created yet by a trigger
  // This uses the data provided during sign-up.
  const { user_metadata } = sessionUser;
  if (user_metadata && user_metadata.agent_name) {
    return {
      id: sessionUser.id,
      email: sessionUser.email,
      agentName: user_metadata.agent_name,
      profileData: profileData,
    };
  }
  
  console.warn("User has a session but profile data is unavailable.");
  // This can happen briefly after sign up before the DB trigger runs.
  // We can return a partial user object.
   return {
      id: sessionUser.id,
      email: sessionUser.email,
      agentName: 'Friday', // default
      profileData: {},
    };
};


const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
          const userProfile = await fetchUserProfile(session.user);
          setUser(userProfile);
      } else {
          setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error logging out:", error);
      alert(`Logout failed: ${error.message}`);
    }
    // The onAuthStateChange listener will automatically update session and user state.
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{backgroundColor: 'var(--bg-primary)'}}>
        <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ session, user, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const MainApp: React.FC = () => {
  const { user, logout } = useAuth();
  const [page, setPage] = useState('agent');
  const agentState = useAgent({ user });

  const navigate = (newPage: string) => {
    setPage(newPage);
  };

  const renderPage = () => {
    if (!user) return null; // Should not happen if MainApp is rendered
    switch (page) {
      case 'events':
        return <EventsPage 
                  events={agentState.events} 
                  navigate={navigate} 
                  deleteEvent={agentState.deleteEvent} 
                  updateEvent={agentState.updateEvent}
                />;
      case 'alarms':
        return <AlarmsPage 
                  alarms={agentState.alarms} 
                  navigate={navigate} 
                  deleteAlarm={agentState.deleteAlarm}
                  updateAlarm={agentState.updateAlarm}
                />;
      case 'settings':
        return <SettingsPage navigate={navigate} logout={logout} user={user} />;
      case 'agent':
      default:
        return <AgentInterface agent={agentState} navigate={navigate} user={user} />;
    }
  };

  return (
    <div className="h-full" style={{backgroundColor: 'var(--bg-primary)'}}>
      {renderPage()}
    </div>
  );
};

const App: React.FC = () => {
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  return (
    <AuthProvider>
      <AuthManager />
    </AuthProvider>
  );
};

const AuthManager: React.FC = () => {
    const { session, user } = useAuth();
    const [authRoute, setAuthRoute] = useState<'login' | 'signup'>('login');

    if (!session || !user) {
        return authRoute === 'login' 
            ? <LoginPage onSwitchToSignup={() => setAuthRoute('signup')} /> 
            : <SignupPage onSwitchToLogin={() => setAuthRoute('login')} />;
    }
    
    return <MainApp />;
};

export default App;
