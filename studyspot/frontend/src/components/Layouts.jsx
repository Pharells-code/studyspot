// Layouts.jsx - the page frames: AuthLayout (login pages), UserLayout (student portal), AdminLayout (admin panel).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { fmtDateTime } from '../utils';

function Brand({ to = '/' }) {
  return (
    <Link to={to} className="brand text-decoration-none">
      <span className="brand-mark"><i className="fa-solid fa-door-open" /></span>
      <span className="brand-name">StudySpot</span>
    </Link>
  );
}

/** Centered card layout for login, register and password pages. */
export function AuthLayout() {
  return (
    <div className="auth-shell">
      <header className="auth-top"><Brand to="/login" /></header>
      <main className="auth-main"><Outlet /></main>
      <footer className="auth-foot text-center small">
        StudySpot - Campus Study Room Booking System
      </footer>
    </div>
  );
}

/** The bell icon with unread notifications. */
function NotificationBell() {
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  const load = useCallback(() => api.get('/notifications').then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);            // refresh every 30 seconds
    return () => clearInterval(t);
  }, [load]);

  // close the list when clicking elsewhere
  useEffect(() => {
    const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && data.unread > 0) api.post('/notifications/read').then(() => setData((d) => ({ ...d, unread: 0 }))).catch(() => {});
  };

  return (
    <div className="position-relative" ref={box}>
      <button type="button" className="btn btn-link nav-icon-btn position-relative" onClick={toggle} aria-label="Notifications">
        <i className="fa-solid fa-bell" />
        {data.unread > 0 && <span className="badge rounded-pill bg-danger bell-count">{data.unread}</span>}
      </button>
      {open && (
        <div className="notif-panel shadow">
          <div className="fw-semibold px-3 py-2 border-bottom">Notifications</div>
          {data.items.length === 0 && <div className="text-muted small p-3">No notifications yet.</div>}
          {data.items.map((n) => (
            <div key={n.notification_id} className={`px-3 py-2 border-bottom small ${n.is_read ? '' : 'notif-unread'}`}>
              <div>{n.message}</div>
              <div className="text-muted notif-time">{fmtDateTime(n.sent_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Top navigation bar for students and staff (matches the Deliverable 2 mock-ups). */
export function UserLayout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const doLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div className="app-shell">
      <nav className="navbar navbar-expand-lg navbar-dark app-navbar">
        <div className="container">
          <Brand to="/rooms" />
          <button className="navbar-toggler" type="button" aria-label="Toggle menu" onClick={() => setMenuOpen(!menuOpen)}>
            <span className="navbar-toggler-icon" />
          </button>
          <div className={`collapse navbar-collapse ${menuOpen ? 'show' : ''}`}>
            <ul className="navbar-nav ms-auto align-items-lg-center gap-lg-1" onClick={() => setMenuOpen(false)}>
              <li className="nav-item"><NavLink className="nav-link" to="/rooms">Rooms</NavLink></li>
              <li className="nav-item"><NavLink className="nav-link" to="/my-bookings">My Bookings</NavLink></li>
              <li className="nav-item"><NavLink className="nav-link" to="/profile">Profile</NavLink></li>
              <li className="nav-item"><NavLink className="nav-link" to="/help">Help</NavLink></li>
              {isAdmin && (
                <li className="nav-item"><NavLink className="nav-link" to="/admin/dashboard"><i className="fa-solid fa-gauge-high me-1" />Admin Panel</NavLink></li>
              )}
              <li className="nav-item"><NotificationBell /></li>
              <li className="nav-item"><span className="nav-link disabled d-none d-xl-inline small">{user.full_name}</span></li>
              <li className="nav-item"><button type="button" className="btn btn-outline-light btn-sm ms-lg-2" onClick={doLogout}>Logout</button></li>
            </ul>
          </div>
        </div>
      </nav>
      <main className="container py-4 app-main"><Outlet /></main>
      <footer className="app-foot text-center small text-muted py-3">
        StudySpot - Campus Study Room Booking System
      </footer>
    </div>
  );
}

const ADMIN_LINKS = [
  ['/admin/dashboard', 'fa-gauge-high', 'Dashboard'],
  ['/admin/rooms', 'fa-door-open', 'Rooms'],
  ['/admin/users', 'fa-users', 'Users'],
  ['/admin/bookings', 'fa-calendar-check', 'Bookings'],
  ['/admin/reports', 'fa-chart-column', 'Reports'],
  ['/admin/audit', 'fa-clipboard-list', 'Audit Logs'],
];

/** Dark sidebar + top bar for administrators (matches the admin mock-ups). */
export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const doLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div className="admin-shell">
      <aside className={`admin-side ${open ? 'open' : ''}`}>
        <div className="admin-side-brand"><Brand to="/admin/dashboard" /></div>
        <nav className="nav flex-column" onClick={() => setOpen(false)}>
          {ADMIN_LINKS.map(([to, icon, label]) => (
            <NavLink key={to} to={to} className="admin-link"><i className={`fa-solid ${icon}`} />{label}</NavLink>
          ))}
          <hr className="admin-hr" />
          <NavLink to="/rooms" className="admin-link"><i className="fa-solid fa-arrow-up-right-from-square" />User portal</NavLink>
          <button type="button" className="admin-link admin-logout" onClick={doLogout}><i className="fa-solid fa-right-from-bracket" />Logout</button>
        </nav>
      </aside>
      <div className="admin-body">
        <header className="admin-top">
          <button type="button" className="btn btn-link d-lg-none admin-burger" aria-label="Menu" onClick={() => setOpen(!open)}>
            <i className="fa-solid fa-bars" />
          </button>
          <div className="ms-auto small">
            <i className="fa-regular fa-circle-user me-1" />
            {user.role === 'Super Administrator' ? 'Super Administrator' : 'Administrator'}: <strong>{user.full_name}</strong>
          </div>
        </header>
        <main className="admin-main"><Outlet /></main>
      </div>
    </div>
  );
}
