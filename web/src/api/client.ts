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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('ap_token');
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  departmentId: string | null;
};

export type Department = {
  id: string;
  name: string;
};

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  departmentId: string;
};

export type RegisterDepartmentPayload = {
  departmentName: string;
  departmentCode?: string;
  name: string;
  email: string;
  password: string;
};

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export async function login(email: string, password: string, departmentId: string) {
  const { data } = await api.post<{ accessToken: string; user: User }>(
    '/api/auth/login',
    { email, password, departmentId },
  );
  localStorage.setItem('ap_token', data.accessToken);
  return data.user;
}

export async function register(payload: RegisterPayload) {
  const { data } = await api.post<{ accessToken: string; user: User }>(
    '/api/auth/register',
    payload,
  );
  localStorage.setItem('ap_token', data.accessToken);
  return data.user;
}

export async function registerDepartment(payload: RegisterDepartmentPayload) {
  const { data } = await api.post<{ accessToken: string; user: User }>(
    '/api/auth/register-department',
    payload,
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
