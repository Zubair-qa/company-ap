import type { FormEvent } from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import type { Department } from '../api/client';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

const demoUsers = [
  { label: 'AP', email: 'ap@demo.local' },
  { label: 'Finance', email: 'finance-user@demo.local' },
  { label: 'Engineering', email: 'eng-user@demo.local' },
  { label: 'Eng admin', email: 'eng-admin@demo.local' },
  { label: 'Finance admin', email: 'finance-admin@demo.local' },
  { label: 'CFO', email: 'cfo@demo.local' },
  { label: 'Admin', email: 'admin@demo.local' },
];

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
      <section className="auth-intro">
        <span className="journey-pill">Company AP automation</span>
        <h1>Run invoice intake, AI checks, approvals, payments, and Xero close from one workspace.</h1>
        <p>
          Departments submit complete invoice packs, AI validates documents, AP finance
          processes the ticket, CFO signs, and payment status is tracked until close.
        </p>
        <div className="auth-metrics">
          <span>
            <strong>1 day</strong>
            <small>Target AP cycle</small>
          </span>
          <span>
            <strong>AI</strong>
            <small>Document checks</small>
          </span>
          <span>
            <strong>RBAC</strong>
            <small>Scoped access</small>
          </span>
        </div>
      </section>
      <div className="auth-panel">
      <div className="auth-panel-header">
        <span className="auth-logo-small">AP</span>
        <div>
          <h2>Sign in</h2>
          <p>Choose the correct department with your role account.</p>
        </div>
      </div>
      <details className="demo-box" aria-label="Demo users">
        <summary>
          <span>
            <strong>Demo access</strong>
            <small>Password: <code>changeme123</code></small>
          </span>
        </summary>
        <div className="demo-grid">
          {demoUsers.map((item) => (
            <span key={item.email} className="demo-chip">
              <small>{item.label}</small>
              <code>{item.email}</code>
            </span>
          ))}
        </div>
      </details>
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
