import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { RegisterPayload, User } from '../api/client';
import {
  api,
  getToken,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
} from '../api/client';

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, departmentId: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<User>('/api/auth/me')
      .then((r) => setUser(r.data))
      .catch(() => {
        apiLogout();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string, departmentId: string) => {
    const u = await apiLogin(email, password, departmentId);
    setUser(u);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const u = await apiRegister(payload);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
