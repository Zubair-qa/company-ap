import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="topbar">
        <h1>Accounts payable</h1>
        {user ? (
          <nav>
            <Link to="/">Invoices</Link>
            <span className="muted" style={{ color: '#94a3b8' }}>
              {user.name} · {user.role.replaceAll('_', ' ')}
            </span>
            <button type="button" className="btn btn-secondary" onClick={logout}>
              Log out
            </button>
          </nav>
        ) : null}
      </header>
      <div className="layout">
        <Outlet />
      </div>
    </>
  );
}
