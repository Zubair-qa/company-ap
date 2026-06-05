import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { NotificationItem } from '../api/client';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type NavItem = {
  to: string;
  label: string;
  roles?: string[];
};

const navItems = [
  { to: '/', label: 'Payment board' },
  { to: '/dashboard', label: 'Reports dashboard', roles: ['AP_CLERK', 'CFO'] },
  { to: '/notifications', label: 'Notifications' },
  { to: '/operations', label: 'Operations' },
  { to: '/invoices', label: 'Invoices', roles: ['DEPT_USER'] },
] satisfies NavItem[];

function displayName(name: string | undefined) {
  return name === 'AP Clerk' ? 'AP Finance' : name ?? '';
}

function displayRole(role: string | undefined) {
  if (role === 'AP_CLERK') return 'AP Finance';
  return role?.replaceAll('_', ' ').toLowerCase() ?? '';
}

export function Layout() {
  const { user, logout } = useAuth();
  const userName = displayName(user?.name);
  const roleLabel = displayRole(user?.role);
  const departmentLabel = user?.departmentId ? 'Department scoped' : 'Company wide';
  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get<NotificationItem[]>('/api/notifications');
      return data;
    },
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });
  const unreadCount = (notifications ?? []).filter((item) => !item.read).length;
  const visibleNav = navItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">AP</div>
          <div>
            <h1>Company AP</h1>
            <p>Agentic payable automation</p>
          </div>
        </div>

        {user ? (
          <>
            <div className="nav-group-title">Workspace</div>
            <nav className="side-nav" aria-label="Primary">
              {visibleNav.map((item, index) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-btn">
                  <span className="nav-index">{String(index + 1).padStart(2, '0')}</span>
                  <span>{item.label}</span>
                  {item.to === '/notifications' && unreadCount ? (
                    <span className="nav-badge">{unreadCount}</span>
                  ) : null}
                </NavLink>
              ))}
            </nav>

            <div className="nav-group-title">Session</div>
            <div className="session-card">
              <strong>{userName}</strong>
              <span>{roleLabel}</span>
              <span>{departmentLabel}</span>
            </div>
          </>
        ) : null}
      </aside>

      <main className="app-main">
        <header className="topbar">
          <div>
            <h2>Accounts payable</h2>
            <p>Department User {'->'} AI Validation {'->'} AP Finance {'->'} CFO {'->'} Bank {'->'} Xero close</p>
          </div>
          {user ? (
            <div className="actions">
              <span className="auth-pill">
                <strong>{userName}</strong>
                <span>{roleLabel}</span>
              </span>
              <button type="button" className="btn btn-secondary" onClick={logout}>
                Log out
              </button>
            </div>
          ) : null}
        </header>
        <div className="layout">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
