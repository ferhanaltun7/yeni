import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { User } from '../types';
import { authAPI } from '../services/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  completeOnboarding: (name: string, monthlyIncome?: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const processSessionId = useCallback(async (sessionId: string) => {
    try {
      console.log('Processing session ID...');
      const { user: userData, session_token } = await authAPI.exchangeSession(sessionId);
      await AsyncStorage.setItem('session_token', session_token);
      setUser(userData);
      console.log('Session processed successfully');
    } catch (error) {
      console.error('Failed to process session:', error);
      throw error;
    }
  }, []);

  const extractSessionId = (url: string): string | null => {
    // Check hash first
    const hashMatch = url.match(/#session_id=([^&]+)/);
    if (hashMatch) return hashMatch[1];
    
    // Check query params
    const queryMatch = url.match(/[?&]session_id=([^&]+)/);
    if (queryMatch) return queryMatch[1];
    
    return null;
  };

  const checkExistingSession = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      if (token) {
        const userData = await authAPI.getMe();
        setUser(userData);
        return true;
      }
    } catch (error) {
      console.log('No valid session found');
      await AsyncStorage.removeItem('session_token');
    }
    return false;
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        // Check for session_id in URL (cold start)
        if (Platform.OS === 'web') {
          const hash = window.location.hash;
          const sessionId = extractSessionId(hash || window.location.search);
          if (sessionId) {
            await processSessionId(sessionId);
            // Clean URL
            window.history.replaceState(null, '', window.location.pathname);
            setIsLoading(false);
            return;
          }
        } else {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) {
            const sessionId = extractSessionId(initialUrl);
            if (sessionId) {
              await processSessionId(sessionId);
              setIsLoading(false);
              return;
            }
          }
        }
        
        // Check existing session
        await checkExistingSession();
      } catch (error) {
        console.error('Init error:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    init();
    
    // Listen for URL changes (hot link - app already running)
    const subscription = Linking.addEventListener('url', async (event) => {
      const sessionId = extractSessionId(event.url);
      if (sessionId) {
        setIsLoading(true);
        try {
          await processSessionId(sessionId);
        } catch (error) {
          console.error('URL event error:', error);
        } finally {
          setIsLoading(false);
        }
      }
    });
    
    return () => subscription.remove();
  }, [processSessionId, checkExistingSession]);

  const login = async () => {
    try {
      const redirectUrl = Platform.OS === 'web'
        ? `${BACKEND_URL}/`
        : Linking.createURL('/');
      
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      
      if (Platform.OS === 'web') {
        window.location.href = authUrl;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
        
        if (result.type === 'success' && result.url) {
          const sessionId = extractSessionId(result.url);
          if (sessionId) {
            setIsLoading(true);
            await processSessionId(sessionId);
            setIsLoading(false);
          }
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout API error:', error);
    }
    await AsyncStorage.removeItem('session_token');
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const userData = await authAPI.getMe();
      setUser(userData);
    } catch (error) {
      console.error('Refresh user error:', error);
    }
  };

  const completeOnboarding = async (name: string, monthlyIncome?: number) => {
    try {
      const updatedUser = await authAPI.completeOnboarding({ name, monthly_income: monthlyIncome });
      setUser(updatedUser);
    } catch (error) {
      console.error('Onboarding error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
        completeOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
