import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="topbar">
        <h1>Accounts payable</h1>
        {user ? (
          <nav>
            <NavLink to="/">{user.role === 'DEPT_ADMIN' ? 'Head Board' : 'AP Board'}</NavLink>
            {user.role !== 'DEPT_ADMIN' ? (
              <>
                <NavLink to="/dashboard">Dashboard</NavLink>
                <NavLink to="/operations">Operations</NavLink>
                <NavLink to="/invoices">Invoices</NavLink>
              </>
            ) : null}
            <span className="muted" style={{ color: '#94a3b8' }}>
              {user.name} - {user.role.replaceAll('_', ' ')}
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
