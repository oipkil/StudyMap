import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  role: 'USER' | 'ADMIN';
  isEmailVerified: boolean;
  unreadNotificationsCount?: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: { identifier: string; password: string }) => Promise<void>;
  register: (payload: { email: string; username: string; password: string; displayName: string }) => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Cấu hình Axios gửi cookie credentials và đính kèm CSRF token
axios.defaults.withCredentials = true;

axios.interceptors.request.use((config) => {
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/ssg_csrf=([^;]+)/);
    if (match && match[1]) {
      config.headers = config.headers || {};
      config.headers['x-csrf-token'] = match[1];
    }
  }
  return config;
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchCurrentUser = async () => {
    try {
      const res = await axios.get('/api/v1/auth/me');
      if (res.data.success && res.data.data) {
        setUser(res.data.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const login = async (credentials: { identifier: string; password: string }) => {
    const res = await axios.post('/api/v1/auth/login', credentials);
    if (res.data.success) {
      setUser(res.data.data.user);
    }
  };

  const register = async (payload: { email: string; username: string; password: string; displayName: string }) => {
    const res = await axios.post('/api/v1/auth/register', payload);
    if (res.data.success) {
      setUser(res.data.data.user);
    }
  };

  const logout = async () => {
    await axios.post('/api/v1/auth/logout');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        refetchUser: fetchCurrentUser,
      }}
    >
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
