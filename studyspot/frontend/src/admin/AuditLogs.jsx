// AuditLogs.jsx - the audit trail: who did what, and when (logins, bookings, admin changes).
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { EmptyState, ErrorBox, Field, Loading, PageHeader } from '../components/ui';
import { errorMessage, fmtDateTime } from '../utils';

/** Colour of an action badge, chosen from the start of the action name. */
function actionColour(action) {
  if (action === 'LOGIN_FAILED' || action.startsWith('DELETE') || action.includes('CANCEL')) return 'danger';
  if (action.startsWith('CREATE') || action === 'REGISTER') return 'success';
  if (action.startsWith('UPDATE') || action.startsWith('APPROVE') || action.includes('RESET') || action.includes('CHANGE')) return 'primary';
  return 'secondary';
}

export default function AuditLogs() {
  const [filters, setFilters] = useState({ q: '', from: '', to: '' });
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async (f = filters) => {
    setError('');
    try { setRows(await api.get('/admin/audit', f)); } catch (e) { setError(errorMessage(e)); }
  }, [filters]);
  useEffect(() => { load({ q: '', from: '', to: '' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (e) => setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));
  const clear = () => { const c = { q: '', from: '', to: '' }; setFilters(c); load(c); };

  return (
    <>
      <PageHeader title="Audit logs" icon="fa-clipboard-list" subtitle="A permanent record of important actions in the system."
        actions={<button type="button" className="btn btn-outline-primary" onClick={() => load()}><i className="fa-solid fa-rotate me-2" />Refresh</button>} />

      <form className="card card-body mb-3" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <div className="row g-2 align-items-end">
          <div className="col-md-5"><Field label="Search" name="q" placeholder="Action, user or details, e.g. CREATE_BOOKING" value={filters.q} onChange={change} className="mb-0" /></div>
          <div className="col-6 col-md-2"><Field label="From" name="from" type="date" value={filters.from} onChange={change} className="mb-0" /></div>
          <div className="col-6 col-md-2"><Field label="To" name="to" type="date" value={filters.to} onChange={change} className="mb-0" /></div>
          <div className="col-md-3 d-flex gap-2">
            <button className="btn btn-primary flex-grow-1" type="submit"><i className="fa-solid fa-filter me-1" />Apply</button>
            <button className="btn btn-outline-secondary" type="button" onClick={clear}>Clear</button>
          </div>
        </div>
      </form>

      <ErrorBox message={error} onRetry={() => load()} />
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && <EmptyState title="No events found" text="Change the filters to see more." />}
      {rows && rows.length > 0 && (
        <>
          <p className="small text-muted mb-2">Showing the {rows.length} most recent matching events</p>
          <div className="table-responsive card">
            <table className="table table-sm table-hover mb-0">
              <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Record</th><th>Details</th><th>IP</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.log_id}>
                    <td className="text-nowrap small">{fmtDateTime(r.created_at)}</td>
                    <td>{r.user_name || <span className="text-muted">System / deleted user</span>}{r.user_email && <div className="small text-muted">{r.user_email}</div>}</td>
                    <td><span className={`badge bg-${actionColour(r.action)}-subtle text-${actionColour(r.action)}-emphasis border border-${actionColour(r.action)}-subtle`}>{r.action}</span></td>
                    <td className="small">{r.table_name ? `${r.table_name}${r.record_id ? ` #${r.record_id}` : ''}` : '-'}</td>
                    <td className="small">{r.details || '-'}</td>
                    <td className="small text-muted">{r.ip_address || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
