import type { FormEvent } from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import type { Department } from '../api/client';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const [email, setEmail] = useState('ap@demo.local');
  const [password, setPassword] = useState('changeme123');
  const [departmentId, setDepartmentId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: departments, isLoading: departmentsLoading } = useQuery({
    queryKey: ['public-departments'],
    queryFn: async () => {
      const { data } = await api.get<Department[]>('/api/departments');
      return data;
    },
  });

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password, departmentId);
    } catch {
      setError('Could not sign in. Check email, password, and department.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
      <h2 style={{ marginTop: 0 }}>Sign in</h2>
      <p className="muted">
        Demo users (password <code>changeme123</code>): <code>ap@demo.local</code>,{' '}
        <code>finance-admin@demo.local</code>, <code>eng-admin@demo.local</code>,{' '}
        <code>admin@demo.local</code>
      </p>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="department">Department</label>
          <select
            id="department"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            disabled={departmentsLoading}
            required
          >
            <option value="">Select department...</option>
            {(departments ?? []).map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="btn btn-primary" disabled={busy || loading}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-switch">
        Need an account? <Link to="/register">Register</Link>
      </p>
      </div>
    </div>
  );
}
