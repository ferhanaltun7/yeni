import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Bill, BillCreate, Category, DashboardStats } from '../types';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('session_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth API
export const authAPI = {
  exchangeSession: async (sessionId: string): Promise<{ user: User; session_token: string }> => {
    const response = await api.post('/auth/session', {}, {
      headers: { 'X-Session-ID': sessionId },
    });
    return response.data;
  },
  
  getMe: async (): Promise<User> => {
    const response = await api.get('/auth/me');
    return response.data;
  },
  
  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },
  
  completeOnboarding: async (data: { name: string; monthly_income?: number }): Promise<User> => {
    const response = await api.put('/auth/onboarding', data);
    return response.data;
  },
};

// Bills API
export const billsAPI = {
  getAll: async (): Promise<Bill[]> => {
    const response = await api.get('/bills');
    return response.data;
  },
  
  getById: async (billId: string): Promise<Bill> => {
    const response = await api.get(`/bills/${billId}`);
    return response.data;
  },
  
  create: async (data: BillCreate): Promise<Bill> => {
    const response = await api.post('/bills', data);
    return response.data;
  },
  
  update: async (billId: string, data: Partial<BillCreate & { is_paid: boolean }>): Promise<Bill> => {
    const response = await api.put(`/bills/${billId}`, data);
    return response.data;
  },
  
  delete: async (billId: string): Promise<void> => {
    await api.delete(`/bills/${billId}`);
  },
  
  togglePaid: async (billId: string): Promise<Bill> => {
    const response = await api.post(`/bills/${billId}/toggle-paid`);
    return response.data;
  },
};

// Dashboard API
export const dashboardAPI = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await api.get('/dashboard/stats');
    return response.data;
  },
};

// Categories API
export const categoriesAPI = {
  getAll: async (): Promise<Category[]> => {
    const response = await api.get('/categories');
    return response.data;
  },
  
  getGroups: async (): Promise<any[]> => {
    const response = await api.get('/category-groups');
    return response.data;
  },
};

// OCR / Bill Scanning API
export interface BillScanResult {
  success: boolean;
  title?: string;
  amount?: number;
  due_date?: string;
  category?: string;
  raw_text?: string;
  error?: string;
}

export const ocrAPI = {
  scanBill: async (imageBase64: string): Promise<BillScanResult> => {
    const response = await api.post('/bills/scan', { image_base64: imageBase64 });
    return response.data;
  },
};

export default api;
