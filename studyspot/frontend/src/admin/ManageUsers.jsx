// ManageUsers.jsx - register users, edit, suspend / activate, reset passwords and delete.
// Administrators manage ordinary users; only a Super Administrator manages administrator accounts.
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { ConfirmModal, EmptyState, ErrorBox, Field, Loading, Modal, PageHeader, StatusBadge } from '../components/ui';
import { errorMessage, fmtDateTime } from '../utils';

const ROLES = ['User', 'Administrator', 'Super Administrator'];
const EMPTY = { id_number: '', full_name: '', email: '', phone: '', role: 'User', password: '', status: 'active' };
const ROLE_COLOUR = { User: 'secondary', Administrator: 'primary', 'Super Administrator': 'dark' };

export default function ManageUsers() {
  const { user: me, isSuper } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [filters, setFilters] = useState({ q: '', role: '', status: '' });
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(null);      // null | 'new' | user object
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [toReset, setToReset] = useState(null);
  const [tempPassword, setTempPassword] = useState(null);   // { name, password }

  const load = useCallback(async (f = filters) => {
    setError('');
    try { setUsers(await api.get('/admin/users', f)); } catch (e) { setError(errorMessage(e)); }
  }, [filters]);
  useEffect(() => { load({ q: '', role: '', status: '' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Plain administrators may only touch ordinary users; nobody may act on their own row. */
  const lockReason = (u) => {
    if (u.user_id === me.user_id) return 'You cannot do this to your own account.';
    if (u.role !== 'User' && !isSuper) return 'Only a Super Administrator can manage administrator accounts.';
    return '';
  };

  const openForm = (u) => {
    setErrors({});
    setFormError('');
    setForm(u === 'new' ? EMPTY : { ...EMPTY, full_name: u.full_name, phone: u.phone || '', status: u.status, role: u.role, email: u.email, id_number: u.id_number });
    setEditing(u);
  };

  const change = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((er) => ({ ...er, [e.target.name]: undefined }));
  };

  const validate = () => {
    const found = {};
    if (form.full_name.trim().length < 3) found.full_name = 'Enter the full name (at least 3 characters).';
    if (form.phone && !/^\+?[0-9 ]{7,15}$/.test(form.phone)) found.phone = 'Enter a valid phone number (7-15 digits).';
    if (editing === 'new') {
      if (!/^[A-Za-z0-9/-]{3,20}$/.test(form.id_number)) found.id_number = 'Enter the student/staff number (3-20 letters or numbers).';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) found.email = 'Enter a valid email address.';
      if (form.password && (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password))) {
        found.password = 'At least 8 characters with a letter and a number (or leave blank).';
      }
    }
    return found;
  };

  const save = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const res = editing === 'new'
        ? await api.post('/admin/users', form)
        : await api.put(`/admin/users/${editing.user_id}`, { full_name: form.full_name, phone: form.phone, status: form.status, role: form.role });
      toast.success(res.message);
      if (res.temporary_password) setTempPassword({ name: form.full_name, password: res.temporary_password });
      setEditing(null);
      load();
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(errorMessage(err));
    } finally { setBusy(false); }
  };

  const toggleStatus = async (u) => {
    try {
      const res = await api.put(`/admin/users/${u.user_id}`, { status: u.status === 'active' ? 'suspended' : 'active' });
      toast.success(res.message);
      load();
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const confirmReset = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/admin/users/${toReset.user_id}/reset-password`, {});
      setTempPassword({ name: toReset.full_name, password: res.temporary_password });
      toast.success(res.message);
    } catch (err) { toast.error(errorMessage(err)); }
    setToReset(null);
    setBusy(false);
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const res = await api.del(`/admin/users/${toDelete.user_id}`);
      toast.success(res.message);
      load();
    } catch (err) { toast.error(errorMessage(err)); }
    setToDelete(null);
    setBusy(false);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(tempPassword.password); toast.info('Copied to the clipboard.'); } catch (e) { toast.error('Could not copy. Select the text and copy it manually.'); }
  };

  const setFilter = (e) => setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Manage users"
        icon="fa-users"
        subtitle="Register users, reset passwords and control access."
        actions={<button type="button" className="btn btn-primary" onClick={() => openForm('new')}><i className="fa-solid fa-user-plus me-2" />Register user</button>}
      />

      <form className="card card-body mb-3" onSubmit={(e) => { e.preventDefault(); load(filters); }}>
        <div className="row g-2">
          <div className="col-md-5"><input className="form-control" name="q" placeholder="Search name, email or ID number..." value={filters.q} onChange={setFilter} aria-label="Search users" /></div>
          <div className="col-6 col-md-2">
            <select className="form-select" name="role" value={filters.role} onChange={setFilter} aria-label="Role"><option value="">All roles</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
          </div>
          <div className="col-6 col-md-2">
            <select className="form-select" name="status" value={filters.status} onChange={setFilter} aria-label="Status"><option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
          </div>
          <div className="col-md-3 d-flex gap-2">
            <button className="btn btn-primary flex-grow-1" type="submit"><i className="fa-solid fa-filter me-2" />Apply</button>
            <button className="btn btn-outline-secondary" type="button" onClick={() => { const c = { q: '', role: '', status: '' }; setFilters(c); load(c); }}>Clear</button>
          </div>
        </div>
      </form>

      <ErrorBox message={error} onRetry={() => load()} />
      {!users && !error && <Loading />}
      {users && users.length === 0 && <EmptyState title="No users found" text="Try different filters." />}
      {users && users.length > 0 && (
        <div className="table-responsive card">
          <table className="table table-hover mb-0">
            <thead><tr><th>ID no.</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th>Bookings</th><th className="text-end">Actions</th></tr></thead>
            <tbody>
              {users.map((u) => {
                const lock = lockReason(u);
                return (
                  <tr key={u.user_id}>
                    <td>{u.id_number}</td>
                    <td className="fw-semibold">{u.full_name}{u.phone && <div className="small text-muted fw-normal">{u.phone}</div>}</td>
                    <td>{u.email}</td>
                    <td><span className={`badge bg-${ROLE_COLOUR[u.role]}`}>{u.role}</span></td>
                    <td><StatusBadge status={u.status} /></td>
                    <td className="small">{u.last_login ? fmtDateTime(u.last_login) : 'Never'}</td>
                    <td>{u.booking_count}</td>
                    <td className="text-end text-nowrap" title={lock}>
                      <button type="button" className="btn btn-sm btn-outline-primary me-1" disabled={u.role !== 'User' && !isSuper} onClick={() => openForm(u)} title="Edit"><i className="fa-solid fa-pen" /></button>
                      <button type="button" className="btn btn-sm btn-outline-secondary me-1" disabled={!!lock} onClick={() => setToReset(u)} title="Reset password"><i className="fa-solid fa-key" /></button>
                      <button type="button" className={`btn btn-sm me-1 ${u.status === 'active' ? 'btn-outline-warning' : 'btn-outline-success'}`} disabled={!!lock} onClick={() => toggleStatus(u)} title={u.status === 'active' ? 'Suspend' : 'Activate'}>
                        <i className={`fa-solid ${u.status === 'active' ? 'fa-user-lock' : 'fa-user-check'}`} />
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" disabled={!!lock} onClick={() => setToDelete(u)} title="Delete"><i className="fa-solid fa-trash" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        show={!!editing}
        title={editing === 'new' ? 'Register user' : 'Edit user'}
        onClose={() => setEditing(null)}
        footer={(
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
            <button type="submit" form="user-form" className="btn btn-primary" disabled={busy}>{busy && <span className="spinner-border spinner-border-sm me-2" />}Save</button>
          </>
        )}
      >
        <form id="user-form" onSubmit={save} noValidate>
          {formError && <div className="alert alert-danger py-2">{formError}</div>}
          {editing === 'new' && (
            <div className="row">
              <div className="col-md-6"><Field label="Student / staff number" name="id_number" required value={form.id_number} onChange={change} error={errors.id_number} /></div>
              <div className="col-md-6"><Field label="Email" name="email" type="email" required value={form.email} onChange={change} error={errors.email} /></div>
            </div>
          )}
          <Field label="Full name" name="full_name" required value={form.full_name} onChange={change} error={errors.full_name} />
          <Field label="Phone" name="phone" type="tel" value={form.phone} onChange={change} error={errors.phone} />
          <div className="row">
            <div className="col-md-6">
              <Field label="Role" name="role" as="select" value={form.role} onChange={change} error={errors.role} disabled={!isSuper} help={!isSuper ? 'Only a Super Administrator can assign roles.' : undefined}>
                {(isSuper ? ROLES : ['User']).map((r) => <option key={r}>{r}</option>)}
                {!isSuper && form.role !== 'User' && <option>{form.role}</option>}
              </Field>
            </div>
            {editing !== 'new' && (
              <div className="col-md-6">
                <Field label="Status" name="status" as="select" value={form.status} onChange={change} error={errors.status}>
                  <option value="active">Active</option><option value="suspended">Suspended</option>
                </Field>
              </div>
            )}
          </div>
          {editing === 'new' && (
            <Field label="Password (optional)" name="password" type="password" autoComplete="new-password" value={form.password} onChange={change} error={errors.password}
              help="Leave blank to create a temporary password that you can give to the user." />
          )}
        </form>
      </Modal>

      <ConfirmModal show={!!toReset} title="Reset password?" confirmText="Reset password" busy={busy} onConfirm={confirmReset} onCancel={() => setToReset(null)}
        message={toReset && `A new temporary password will be created for ${toReset.full_name}. Their old password stops working immediately.`} />
      <ConfirmModal show={!!toDelete} title="Delete this user?" danger confirmText="Delete user" busy={busy} onConfirm={confirmDelete} onCancel={() => setToDelete(null)}
        message={toDelete && `${toDelete.full_name} (${toDelete.email}) will be deleted. Users with bookings cannot be deleted - suspend them instead.`} />

      <Modal show={!!tempPassword} title="Temporary password" onClose={() => setTempPassword(null)}
        footer={<button type="button" className="btn btn-primary" onClick={() => setTempPassword(null)}>Done</button>}>
        {tempPassword && (
          <>
            <p>Give this temporary password to <strong>{tempPassword.name}</strong>. It is shown only once.</p>
            <div className="input-group">
              <input className="form-control font-monospace" readOnly value={tempPassword.password} aria-label="Temporary password" onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn-outline-primary" onClick={copy}><i className="fa-regular fa-copy me-1" />Copy</button>
            </div>
            <p className="small text-muted mt-3 mb-0">Ask the user to change it under Profile after logging in.</p>
          </>
        )}
      </Modal>
    </>
  );
}
