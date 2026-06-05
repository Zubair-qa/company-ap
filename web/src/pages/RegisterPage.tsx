import type { FormEvent } from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import type { Department } from '../api/client';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type RegisterMode = 'user' | 'department';

export function RegisterPage() {
  const { user, register, registerDepartment, loading } = useAuth();
  const [mode, setMode] = useState<RegisterMode>('user');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [departmentCode, setDepartmentCode] = useState('');
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
      if (mode === 'department') {
        await registerDepartment({
          departmentName,
          departmentCode: departmentCode || undefined,
          name,
          email,
          password,
        });
      } else {
        await register({ name, email, password, departmentId });
      }
    } catch {
      setError(
        mode === 'department'
          ? 'Could not register department. Use a new department name and email.'
          : 'Could not register. Use a new email and select a department.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-intro">
        <span className="journey-pill">Department onboarding</span>
        <h1>Create department users without exposing finance roles.</h1>
        <p>
          Existing departments can add more request users, and new departments like NOC
          or IT can onboard into the same AP workflow with the same department-scoped access.
        </p>
        <div className="auth-metrics">
          <span>
            <strong>Role</strong>
            <small>Department user</small>
          </span>
          <span>
            <strong>Scope</strong>
            <small>Own department</small>
          </span>
          <span>
            <strong>Flow</strong>
            <small>Invoice to AP</small>
          </span>
        </div>
      </section>
      <div className="auth-panel">
        <div className="auth-panel-header">
          <span className="auth-logo-small">AP</span>
          <div>
            <h2>Register</h2>
            <p>Every public registration creates a department user.</p>
          </div>
        </div>

        <div className="segmented-control" aria-label="Registration type">
          <button
            type="button"
            className={mode === 'user' ? 'active' : ''}
            onClick={() => setMode('user')}
          >
            Existing department user
          </button>
          <button
            type="button"
            className={mode === 'department' ? 'active' : ''}
            onClick={() => setMode('department')}
          >
            New department
          </button>
        </div>

        <form onSubmit={onSubmit}>
          {mode === 'department' ? (
            <div className="auth-form-grid">
              <div className="field">
                <label htmlFor="departmentName">Department name</label>
                <input
                  id="departmentName"
                  value={departmentName}
                  onChange={(e) => setDepartmentName(e.target.value)}
                  placeholder="NOC, IT, Procurement"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="departmentCode">Department code</label>
                <input
                  id="departmentCode"
                  value={departmentCode}
                  onChange={(e) => setDepartmentCode(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
          ) : (
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
          )}

          <div className="field">
            <label htmlFor="name">User name</label>
            <input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
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
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="role-lock">
            <strong>Default access</strong>
            <span>Department user, limited to the selected or newly created department.</span>
          </div>

          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={busy || loading}>
            {busy ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="auth-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
