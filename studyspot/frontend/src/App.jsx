// App.jsx - all pages and who may open them (routing).
import React from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AdminLayout, AuthLayout, UserLayout } from './components/Layouts';
import { Loading } from './components/ui';

// Front-end (user portal)
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import RoomSearch from './pages/RoomSearch';
import BookRoom from './pages/BookRoom';
import MyBookings from './pages/MyBookings';
import Profile from './pages/Profile';
import Help from './pages/Help';

// Admin panel
import Dashboard from './admin/Dashboard';
import ManageRooms from './admin/ManageRooms';
import ManageUsers from './admin/ManageUsers';
import ManageBookings from './admin/ManageBookings';
import Reports from './admin/Reports';
import AuditLogs from './admin/AuditLogs';

/** Only logged-in users get in. adminOnly = only Administrators / Super Administrators. */
function Protected({ adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <Loading text="Checking your login..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (adminOnly && !isAdmin) return <Navigate to="/rooms" replace />;
  return <Outlet />;
}

/** Login / register pages: logged-in users are sent on to their home page. */
function GuestOnly() {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <Loading text="Checking your login..." />;
  if (user) return <Navigate to={isAdmin ? '/admin/dashboard' : '/rooms'} replace />;
  return <Outlet />;
}

function Home() {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={isAdmin ? '/admin/dashboard' : '/rooms'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      {/* Public pages */}
      <Route element={<AuthLayout />}>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>

      {/* Students and staff */}
      <Route element={<Protected />}>
        <Route element={<UserLayout />}>
          <Route path="/rooms" element={<RoomSearch />} />
          <Route path="/rooms/:id/book" element={<BookRoom />} />
          <Route path="/my-bookings" element={<MyBookings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/help" element={<Help />} />
        </Route>
      </Route>

      {/* Administrators */}
      <Route element={<Protected adminOnly />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={<Dashboard />} />
          <Route path="/admin/rooms" element={<ManageRooms />} />
          <Route path="/admin/users" element={<ManageUsers />} />
          <Route path="/admin/bookings" element={<ManageBookings />} />
          <Route path="/admin/reports" element={<Reports />} />
          <Route path="/admin/audit" element={<AuditLogs />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
