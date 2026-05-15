import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL ?? '';

export const api = axios.create({
  baseURL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ap_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (!(config.data instanceof FormData) && config.data != null) {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});

export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  departmentId: string | null;
};

export async function login(email: string, password: string) {
  const { data } = await api.post<{ accessToken: string; user: User }>(
    '/api/auth/login',
    { email, password },
  );
  localStorage.setItem('ap_token', data.accessToken);
  return data.user;
}

export function logout() {
  localStorage.removeItem('ap_token');
}

export function getToken() {
  return localStorage.getItem('ap_token');
}
