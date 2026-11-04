// Register.jsx - create a student/staff account.
// Validation mirrors the server (backend routes/auth.js validateProfile and utils/validate.js
// passwordError) so users get instant, inline feedback; server `fields` errors are shown too.
// Also exports passwordProblem() and PasswordStrength, reused by the reset/profile pages.
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Field } from '../components/ui';
import { useToast } from '../components/Toast';
import { errorMessage } from '../utils';

/** Same rules as the server's passwordError(); returns a message or ''. */
export function passwordProblem(pw) {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters long.';
  if (pw.length > 72) return 'Password must be 72 characters or fewer.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain at least one letter and one number.';
  return '';
}

/** Scores a password 0-4 for the live strength hint. */
function strengthScore(pw) {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) score += 1;
  return score;
}

/** Coloured bar + text under a password field. */
export function PasswordStrength({ password }) {
  if (!password) return <div className="form-text mb-3 mt-n2">Use 8+ characters with at least one letter and one number.</div>;
  const score = strengthScore(password);
  const levels = [
    { text: 'Too weak', colour: 'danger' }, { text: 'Weak', colour: 'danger' },
    { text: 'Fair', colour: 'warning' }, { text: 'Good', colour: 'info' }, { text: 'Strong', colour: 'success' },
  ];
  const { text, colour } = levels[score];
  return (
    <div className="mb-3 mt-n2" aria-live="polite">
      <div className="progress" style={{ height: 6 }}>
        <div className={`progress-bar bg-${colour}`} style={{ width: `${Math.max(score, 1) * 25}%` }} />
      </div>
      <div className={`form-text text-${colour === 'info' ? 'primary' : colour}`}>Password strength: {text}</div>
    </div>
  );
}

const EMPTY = { id_number: '', full_name: '', email: '', phone: '', password: '', confirm_password: '' };

export default function Register() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((er) => ({ ...er, [e.target.name]: undefined }));
  };

  const validate = () => {
    const f = {};
    const id = form.id_number.trim();
    if (!id) f.id_number = 'Enter your student/staff number.';
    else if (!/^[A-Za-z0-9/-]{3,20}$/.test(id)) f.id_number = 'Use 3-20 letters, numbers, - or /.';
    if (form.full_name.trim().length < 3) f.full_name = 'Enter your full name (at least 3 characters).';
    else if (form.full_name.trim().length > 100) f.full_name = 'Full name must be 100 characters or fewer.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) f.email = 'Enter a valid email address.';
    if (form.phone.trim() && !/^\+?[0-9 ]{7,15}$/.test(form.phone.trim())) f.phone = 'Enter a valid phone number (7-15 digits), e.g. +254 700 000 000.';
    const pe = passwordProblem(form.password);
    if (pe) f.password = pe;
    if (!form.confirm_password) f.confirm_password = 'Re-type your password.';
    else if (form.password !== form.confirm_password) f.confirm_password = 'Passwords do not match.';
    return f;
  };

  const submit = async (e) => {
    e.preventDefault();
    setServerError('');
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await api.post('/auth/register', {
        ...form, id_number: form.id_number.trim(), full_name: form.full_name.trim(),
        email: form.email.trim(), phone: form.phone.trim(),
      });
      toast.success('Account created. You can now log in.');
      navigate('/login');
    } catch (err) {
      setErrors(err.fields || {});          // show each server message under its field
      setServerError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="card auth-card" style={{ maxWidth: 520 }}>
      <div className="card-body p-4">
        <div className="text-center mb-3">
          <h1 className="h4 page-title mb-1">Create your account</h1>
          <p className="text-muted small mb-0">For Strathmore students and staff.</p>
        </div>

        {serverError && (
          <div className="alert alert-danger py-2 small" role="alert">
            <i className="fa-solid fa-triangle-exclamation me-2" />{serverError}
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <Field label="Student / staff number" name="id_number" value={form.id_number} onChange={update}
            error={errors.id_number} placeholder="e.g. 123456" required autoFocus />
          <Field label="Full name" name="full_name" value={form.full_name} onChange={update}
            error={errors.full_name} autoComplete="name" required />
          <Field label="Email" name="email" type="email" value={form.email} onChange={update}
            error={errors.email} autoComplete="email" required />
          <Field label="Phone (optional)" name="phone" type="tel" value={form.phone} onChange={update}
            error={errors.phone} autoComplete="tel" placeholder="+254 700 000 000" />
          <Field label="Password" name="password" type="password" value={form.password} onChange={update}
            error={errors.password} autoComplete="new-password" required />
          {!errors.password && <PasswordStrength password={form.password} />}
          <Field label="Confirm password" name="confirm_password" type="password" value={form.confirm_password}
            onChange={update} error={errors.confirm_password} autoComplete="new-password" required />

          <button type="submit" className="btn btn-primary w-100" disabled={busy}>
            {busy ? <><span className="spinner-border spinner-border-sm me-2" />Creating account...</> : 'Create account'}
          </button>
        </form>

        <p className="text-center small mt-3 mb-0">Already registered? <Link to="/login">Log in</Link></p>
      </div>
    </div>
  );
}
