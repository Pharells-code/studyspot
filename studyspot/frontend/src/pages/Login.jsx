// Login.jsx - sign-in page for students, staff and administrators.
// On success the user is sent back to the page they originally asked for
// (location.state.from), otherwise to their home page (admin dashboard or room search).
// A small "Demo accounts" box lets presenters fill in the form with one click.
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Field } from '../components/ui';
import { errorMessage } from '../utils';

const DEMO_ACCOUNTS = [
  { label: 'Student', email: 'amina@studyspot.test', password: 'User@123' },
  { label: 'Administrator', email: 'admin@studyspot.test', password: 'Admin@123' },
  { label: 'Super Administrator', email: 'super@studyspot.test', password: 'Super@123' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [busy, setBusy] = useState(false);

  const update = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((er) => ({ ...er, [e.target.name]: undefined }));
  };

  /** Client-side checks so obvious mistakes never reach the server. */
  const validate = () => {
    const found = {};
    if (!form.email.trim()) found.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) found.email = 'Enter a valid email address, e.g. name@strathmore.edu.';
    if (!form.password) found.password = 'Enter your password.';
    return found;
  };

  const submit = async (e) => {
    e.preventDefault();
    setServerError('');
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const user = await login(form.email.trim(), form.password);
      const isAdmin = user.role === 'Administrator' || user.role === 'Super Administrator';
      const target = location.state?.from || (isAdmin ? '/admin/dashboard' : '/rooms');
      navigate(target, { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
      setBusy(false);
    }
  };

  const fillDemo = (account) => {
    setForm({ email: account.email, password: account.password });
    setErrors({});
    setServerError('');
  };

  return (
    <div className="card auth-card">
      <div className="card-body p-4">
        <div className="text-center mb-3">
          <h1 className="h4 page-title mb-1">Welcome back</h1>
          <p className="text-muted small mb-0">Log in to find and book a study room.</p>
        </div>

        {location.state?.from && !serverError && (
          <div className="alert alert-info py-2 small" role="status">
            <i className="fa-solid fa-circle-info me-2" />Please log in to continue.
          </div>
        )}
        {serverError && (
          <div className="alert alert-danger py-2 small" role="alert">
            <i className="fa-solid fa-triangle-exclamation me-2" />{serverError}
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <Field
            label="Email" name="email" type="email" autoComplete="username" placeholder="name@strathmore.edu"
            value={form.email} onChange={update} error={errors.email} required autoFocus
          />

          <div className="mb-3">
            <label htmlFor="password" className="form-label fw-semibold small mb-1">
              Password<span className="text-danger"> *</span>
            </label>
            <div className="input-group has-validation">
              <input
                id="password" name="password" autoComplete="current-password"
                type={showPassword ? 'text' : 'password'}
                className={`form-control ${errors.password ? 'is-invalid' : ''}`}
                value={form.password} onChange={update} aria-invalid={!!errors.password}
              />
              <button
                type="button" className="btn btn-outline-secondary"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
              >
                <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
            </div>
            {errors.password && <div className="invalid-feedback d-block">{errors.password}</div>}
          </div>

          <div className="text-end mb-3 small">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>

          <button type="submit" className="btn btn-primary w-100" disabled={busy}>
            {busy ? <><span className="spinner-border spinner-border-sm me-2" />Logging in...</> : 'Log in'}
          </button>
        </form>

        <p className="text-center small mt-3 mb-0">
          New to StudySpot? <Link to="/register">Create account</Link>
        </p>

        {/* Demo helper for the live presentation */}
        <div className="border rounded-3 mt-4 bg-light">
          <button
            type="button" className="btn btn-link w-100 text-start text-decoration-none small fw-semibold d-flex justify-content-between"
            onClick={() => setShowDemo((s) => !s)} aria-expanded={showDemo}
          >
            <span><i className="fa-solid fa-flask me-2" />Demo accounts</span>
            <i className={`fa-solid ${showDemo ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
          </button>
          {showDemo && (
            <ul className="list-unstyled mb-0 px-3 pb-3 small">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email} className="mb-2">
                  <button type="button" className="btn btn-sm btn-outline-primary w-100 text-start" onClick={() => fillDemo(a)}>
                    <strong>{a.label}</strong><br />
                    <span className="text-break">{a.email} / {a.password}</span>
                  </button>
                </li>
              ))}
              <li className="text-muted">Click an account to fill in the form.</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
