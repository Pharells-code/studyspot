// ForgotPassword.jsx - asks for an email address and requests a password-reset link.
// The server always gives the same generic reply (so nobody can discover which emails exist).
// In demo mode (no email server) it also returns `reset_link`, which we show as an in-app link.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Field } from '../components/ui';
import { errorMessage } from '../utils';

/** "http://host/reset-password?token=abc" -> "/reset-password?token=abc" (keeps navigation inside the SPA). */
function toRelativeLink(link) {
  try {
    const url = new URL(link, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch (e) {
    return '/reset-password';
  }
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [serverError, setServerError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setServerError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      setResult(await api.post('/auth/forgot-password', { email: email.trim() }));
    } catch (err) {
      setError(err.fields?.email || '');
      setServerError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card auth-card">
      <div className="card-body p-4">
        <div className="text-center mb-3">
          <h1 className="h4 page-title mb-1">Forgot your password?</h1>
          <p className="text-muted small mb-0">Enter your email and we will send you a link to choose a new one.</p>
        </div>

        {serverError && <div className="alert alert-danger py-2 small" role="alert"><i className="fa-solid fa-triangle-exclamation me-2" />{serverError}</div>}

        {result ? (
          <div role="status">
            <div className="alert alert-success small">
              <i className="fa-solid fa-circle-check me-2" />{result.message}
            </div>
            {result.reset_link && (
              <div className="alert alert-info small">
                <strong>Demo mode:</strong> no email server is connected, use this link:
                <div className="mt-2"><Link to={toRelativeLink(result.reset_link)} className="btn btn-sm btn-primary">Choose a new password</Link></div>
                <div className="mt-2 text-muted">The link works for 30 minutes.</div>
              </div>
            )}
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setResult(null)}>Use a different email</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <Field label="Email" name="email" type="email" value={email} autoComplete="email" required autoFocus
              onChange={(e) => { setEmail(e.target.value); setError(''); }} error={error} />
            <button type="submit" className="btn btn-primary w-100" disabled={busy}>
              {busy ? <><span className="spinner-border spinner-border-sm me-2" />Sending...</> : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="text-center small mt-3 mb-0"><Link to="/login"><i className="fa-solid fa-arrow-left me-1" />Back to log in</Link></p>
      </div>
    </div>
  );
}
