import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

const navItems = [
  { to: '/', label: 'Payment board', index: '01' },
  { to: '/dashboard', label: 'Reports dashboard', index: '02' },
  { to: '/operations', label: 'Operations', index: '03' },
  { to: '/invoices', label: 'Invoices', index: '04' },
];

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
  const visibleNav = user?.role === 'DEPT_ADMIN' ? navItems.slice(0, 1) : navItems;

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
              {visibleNav.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-btn">
                  <span className="nav-index">{item.index}</span>
                  <span>{item.label}</span>
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
