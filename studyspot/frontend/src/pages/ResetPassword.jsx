// ResetPassword.jsx - the page opened from the reset link (/reset-password?token=...).
// Sends the token and the new password to the server; explains clearly when the link is
// missing, invalid or expired, and sends the user to the login page on success.
import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Field } from '../components/ui';
import { useToast } from '../components/Toast';
import { errorMessage } from '../utils';
import { PasswordStrength, passwordProblem } from './Register';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({ password: '', confirm_password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((er) => ({ ...er, [e.target.name]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setServerError('');
    const found = {};
    const pe = passwordProblem(form.password);
    if (pe) found.password = pe;
    if (!form.confirm_password) found.confirm_password = 'Re-type your new password.';
    else if (form.password !== form.confirm_password) found.confirm_password = 'Passwords do not match.';
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const r = await api.post('/auth/reset-password', { token, ...form });
      toast.success(r.message || 'Password changed. You can now log in.');
      navigate('/login');
    } catch (err) {
      setErrors(err.fields || {});
      setServerError(errorMessage(err));
      setBusy(false);
    }
  };

  // No token in the address: the link was copied incompletely.
  if (!token) {
    return (
      <div className="card auth-card">
        <div className="card-body p-4 text-center">
          <h1 className="h4 page-title">Reset link not valid</h1>
          <div className="alert alert-warning small text-start">
            <i className="fa-solid fa-link-slash me-2" />This page needs a reset link. The link you opened is incomplete - please request a new one.
          </div>
          <Link to="/forgot-password" className="btn btn-primary">Request a new link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card auth-card">
      <div className="card-body p-4">
        <div className="text-center mb-3">
          <h1 className="h4 page-title mb-1">Choose a new password</h1>
          <p className="text-muted small mb-0">Your new password must be different from one you forgot.</p>
        </div>

        {serverError && (
          <div className="alert alert-danger small" role="alert">
            <i className="fa-solid fa-triangle-exclamation me-2" />{serverError}
            {/invalid|expired/i.test(serverError) && <div className="mt-2"><Link to="/forgot-password">Request a new reset link</Link></div>}
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <Field label="New password" name="password" type="password" value={form.password} onChange={update}
            error={errors.password} autoComplete="new-password" required autoFocus />
          {!errors.password && <PasswordStrength password={form.password} />}
          <Field label="Confirm new password" name="confirm_password" type="password" value={form.confirm_password}
            onChange={update} error={errors.confirm_password} autoComplete="new-password" required />
          <button type="submit" className="btn btn-primary w-100" disabled={busy}>
            {busy ? <><span className="spinner-border spinner-border-sm me-2" />Saving...</> : 'Change password'}
          </button>
        </form>
        <p className="text-center small mt-3 mb-0"><Link to="/login">Back to log in</Link></p>
      </div>
    </div>
  );
}
