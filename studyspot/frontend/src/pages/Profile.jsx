// Profile.jsx - view and edit your details, and change your password.
import React, { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Field, PageHeader } from '../components/ui';
import { errorMessage } from '../utils';

/** Same strength rule as the server (8+ characters, a letter and a number). */
function passwordProblem(pw) {
  if (pw.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain at least one letter and one number.';
  return '';
}

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();

  const [info, setInfo] = useState({ full_name: user.full_name, phone: user.phone || '' });
  const [infoErrors, setInfoErrors] = useState({});
  const [infoBusy, setInfoBusy] = useState(false);

  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [pwBusy, setPwBusy] = useState(false);

  const saveInfo = async (e) => {
    e.preventDefault();
    const found = {};
    if (info.full_name.trim().length < 3) found.full_name = 'Enter your full name (at least 3 characters).';
    if (info.phone && !/^\+?[0-9 ]{7,15}$/.test(info.phone)) found.phone = 'Enter a valid phone number (7-15 digits).';
    setInfoErrors(found);
    if (Object.keys(found).length) return;

    setInfoBusy(true);
    try {
      const res = await api.put('/auth/profile', info);
      setUser((u) => ({ ...u, ...res.user }));
      toast.success('Profile updated.');
    } catch (err) {
      setInfoErrors(err.fields || {});
      toast.error(errorMessage(err));
    } finally {
      setInfoBusy(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    const found = {};
    if (!pw.current_password) found.current_password = 'Enter your current password.';
    const problem = passwordProblem(pw.new_password);
    if (problem) found.new_password = problem;
    if (pw.new_password !== pw.confirm) found.confirm = 'The two passwords do not match.';
    setPwErrors(found);
    if (Object.keys(found).length) return;

    setPwBusy(true);
    try {
      await api.put('/auth/password', { current_password: pw.current_password, new_password: pw.new_password });
      toast.success('Password updated.');
      setPw({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      setPwErrors(err.fields || {});
      toast.error(errorMessage(err));
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="My profile" icon="fa-user" subtitle="Your account details and password." />
      <div className="row g-4">
        <div className="col-lg-6">
          <form className="card h-100" onSubmit={saveInfo} noValidate>
            <div className="card-body">
              <h2 className="h5 mb-3">Account details</h2>
              <dl className="row small mb-3">
                <dt className="col-sm-4">Email</dt><dd className="col-sm-8">{user.email}</dd>
                <dt className="col-sm-4">ID number</dt><dd className="col-sm-8">{user.id_number}</dd>
                <dt className="col-sm-4">Role</dt><dd className="col-sm-8"><span className="badge bg-primary">{user.role}</span></dd>
              </dl>
              <Field label="Full name" name="full_name" required value={info.full_name} error={infoErrors.full_name}
                onChange={(e) => setInfo({ ...info, full_name: e.target.value })} />
              <Field label="Phone" name="phone" type="tel" value={info.phone} error={infoErrors.phone} help="Optional, e.g. 0712345678"
                onChange={(e) => setInfo({ ...info, phone: e.target.value })} />
            </div>
            <div className="card-footer bg-transparent text-end">
              <button type="submit" className="btn btn-primary" disabled={infoBusy}>
                {infoBusy && <span className="spinner-border spinner-border-sm me-2" />}Save changes
              </button>
            </div>
          </form>
        </div>

        <div className="col-lg-6">
          <form className="card h-100" onSubmit={savePassword} noValidate>
            <div className="card-body">
              <h2 className="h5 mb-3">Change password</h2>
              <Field label="Current password" name="current_password" type="password" autoComplete="current-password" required
                value={pw.current_password} error={pwErrors.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
              <Field label="New password" name="new_password" type="password" autoComplete="new-password" required
                help="At least 8 characters, with a letter and a number." value={pw.new_password} error={pwErrors.new_password}
                onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
              <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required
                value={pw.confirm} error={pwErrors.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </div>
            <div className="card-footer bg-transparent text-end">
              <button type="submit" className="btn btn-primary" disabled={pwBusy}>
                {pwBusy && <span className="spinner-border spinner-border-sm me-2" />}Update password
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
