
import React, { useState, useEffect, createContext, useContext } from 'react';
import AgentInterface from './pages/AgentInterface';
import EventsPage from './pages/EventsPage';
import AlarmsPage from './pages/AlarmsPage';
import { useAgent } from './hooks/useAgent';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import { supabase } from './utils/supabase';
import { Session } from '@supabase/supabase-js';
import { User } from './types';
import { requestNotificationPermission } from './utils/capacitor';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session?.user) {
        const { data: userData, error } = await supabase
          .from('users')
          .select('agent_name, api_key')
          .eq('id', session.user.id)
          .single();
        if (error) {
          console.error("Error fetching user profile:", error);
        } else if (userData) {
          setUser({ id: session.user.id, email: session.user.email, agentName: userData.agent_name || 'Friday', apiKey: userData.api_key });
        }
      }
      setLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
         const { data: userData, error } = await supabase
          .from('users')
          .select('agent_name, api_key')
          .eq('id', session.user.id)
          .single();
        if (error) {
          console.error("Error fetching user profile on auth change:", error);
          setUser(null);
        } else if (userData) {
          setUser({ id: session.user.id, email: session.user.email, agentName: userData.agent_name || 'Friday', apiKey: userData.api_key });
        }
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>;
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
  const agentState = useAgent({ user, onApiKeyError: logout });

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
      case 'agent':
      default:
        return <AgentInterface agent={agentState} navigate={navigate} user={user} logout={logout}/>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
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
    const { session } = useAuth();
    const [authRoute, setAuthRoute] = useState<'login' | 'signup'>('login');

    if (!session) {
        return authRoute === 'login' 
            ? <LoginPage onSwitchToSignup={() => setAuthRoute('signup')} /> 
            : <SignupPage onSwitchToLogin={() => setAuthRoute('login')} />;
    }

    return <MainApp />;
};

export default App;
