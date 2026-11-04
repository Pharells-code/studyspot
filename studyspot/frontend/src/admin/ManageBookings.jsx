// ManageBookings.jsx - browse, filter, sort, approve and cancel every booking.
// The filters can be pre-set from the address, e.g. /admin/bookings?status=pending (used by the dashboard).
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { EmptyState, ErrorBox, Field, Loading, Modal, PageHeader, StatusBadge } from '../components/ui';
import { errorMessage, fmtDate, fmtDateTime, fmtTime } from '../utils';

const COLUMNS = [
  ['booking_id', 'ID'], ['user', 'User'], ['room', 'Room'], ['date', 'Date'], [null, 'Time'], [null, 'People'], ['status', 'Status'],
];

export default function ManageBookings() {
  const toast = useToast();
  const [params] = useSearchParams();
  const initial = { date: params.get('date') || '', room_id: '', status: params.get('status') || '', q: '' };

  const [filters, setFilters] = useState(initial);
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [rooms, setRooms] = useState([]);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [details, setDetails] = useState(null);
  const [toCancel, setToCancel] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (f = filters, s = sort) => {
    setError('');
    try { setRows(await api.get('/admin/bookings', { ...f, sort: s.key, dir: s.dir })); } catch (e) { setError(errorMessage(e)); }
  }, [filters, sort]);

  useEffect(() => {
    api.get('/admin/rooms').then(setRooms).catch(() => {});
    load(initial, sort);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (e) => setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));
  const clear = () => { const c = { date: '', room_id: '', status: '', q: '' }; setFilters(c); load(c, sort); };

  const sortBy = (key) => {
    const next = { key, dir: sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' };
    setSort(next);
    load(filters, next);
  };

  const approve = async (b) => {
    try { toast.success((await api.post(`/admin/bookings/${b.booking_id}/approve`)).message); load(); } catch (e) { toast.error(errorMessage(e)); }
  };

  const confirmCancel = async () => {
    setBusy(true);
    try {
      toast.success((await api.post(`/admin/bookings/${toCancel.booking_id}/cancel`, { reason })).message);
      load();
    } catch (e) { toast.error(errorMessage(e)); }
    setToCancel(null);
    setReason('');
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="Manage bookings" icon="fa-calendar-check" subtitle="Approve, cancel or look up any booking."
        actions={<button type="button" className="btn btn-outline-primary" onClick={() => load()}><i className="fa-solid fa-rotate me-2" />Refresh</button>} />

      <form className="card card-body mb-3" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <div className="row g-2 align-items-end">
          <div className="col-6 col-lg-2"><Field label="Date" name="date" type="date" value={filters.date} onChange={setFilter} className="mb-0" /></div>
          <div className="col-6 col-lg-3">
            <Field label="Room" name="room_id" as="select" value={filters.room_id} onChange={setFilter} className="mb-0">
              <option value="">All rooms</option>
              {rooms.map((r) => <option key={r.room_id} value={r.room_id}>{r.room_name}</option>)}
            </Field>
          </div>
          <div className="col-6 col-lg-2">
            <Field label="Status" name="status" as="select" value={filters.status} onChange={setFilter} className="mb-0">
              <option value="">Any</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option><option value="cancelled">Cancelled</option>
            </Field>
          </div>
          <div className="col-6 col-lg-3"><Field label="Search user" name="q" placeholder="Name, email or ID" value={filters.q} onChange={setFilter} className="mb-0" /></div>
          <div className="col-lg-2 d-flex gap-2">
            <button className="btn btn-primary flex-grow-1" type="submit"><i className="fa-solid fa-filter me-1" />Apply</button>
            <button className="btn btn-outline-secondary" type="button" onClick={clear}>Clear</button>
          </div>
        </div>
      </form>

      <ErrorBox message={error} onRetry={() => load()} />
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && <EmptyState title="No bookings match" text="Change or clear the filters." />}
      {rows && rows.length > 0 && (
        <>
          <p className="small text-muted mb-2">{rows.length} booking{rows.length === 1 ? '' : 's'}{rows.length === 500 ? ' (showing the first 500)' : ''}</p>
          <div className="table-responsive card">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  {COLUMNS.map(([key, label]) => (
                    <th key={label} style={key ? { cursor: 'pointer' } : undefined} onClick={key ? () => sortBy(key) : undefined} aria-sort={key && sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                      {label}{key && sort.key === key && <i className={`fa-solid fa-arrow-${sort.dir === 'asc' ? 'up' : 'down'} ms-1`} />}
                    </th>
                  ))}
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.booking_id}>
                    <td>#{b.booking_id}</td>
                    <td>{b.user_name}<div className="small text-muted">{b.id_number}</div></td>
                    <td>{b.room_name}<div className="small text-muted">{b.building}</div></td>
                    <td className="text-nowrap">{fmtDate(b.booking_date)}</td>
                    <td className="text-nowrap">{fmtTime(b.start_time)} - {fmtTime(b.end_time)}</td>
                    <td>{b.attendees}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td className="text-end text-nowrap">
                      <button type="button" className="btn btn-sm btn-outline-secondary me-1" onClick={() => setDetails(b)} title="View details"><i className="fa-solid fa-eye" /></button>
                      {b.status === 'pending' && <button type="button" className="btn btn-sm btn-success me-1" onClick={() => approve(b)}><i className="fa-solid fa-check me-1" />Approve</button>}
                      {['pending', 'confirmed'].includes(b.status) && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setToCancel(b)}><i className="fa-solid fa-xmark me-1" />Cancel</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal show={!!details} title={details ? `Booking #${details.booking_id}` : ''} onClose={() => setDetails(null)}
        footer={<button type="button" className="btn btn-primary" onClick={() => setDetails(null)}>Close</button>}>
        {details && (
          <dl className="row mb-0">
            <dt className="col-sm-4">User</dt><dd className="col-sm-8">{details.user_name} ({details.id_number})<br /><span className="text-muted small">{details.user_email}</span></dd>
            <dt className="col-sm-4">Room</dt><dd className="col-sm-8">{details.room_name}, {details.building}</dd>
            <dt className="col-sm-4">When</dt><dd className="col-sm-8">{fmtDate(details.booking_date)}, {fmtTime(details.start_time)} - {fmtTime(details.end_time)}</dd>
            <dt className="col-sm-4">People</dt><dd className="col-sm-8">{details.attendees}</dd>
            <dt className="col-sm-4">Purpose</dt><dd className="col-sm-8">{details.purpose || <span className="text-muted">Not given</span>}</dd>
            <dt className="col-sm-4">Status</dt><dd className="col-sm-8"><StatusBadge status={details.status} /></dd>
            <dt className="col-sm-4">Booked on</dt><dd className="col-sm-8">{fmtDateTime(details.created_at)}</dd>
          </dl>
        )}
      </Modal>

      <Modal show={!!toCancel} title="Cancel this booking?" onClose={() => setToCancel(null)}
        footer={(
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setToCancel(null)} disabled={busy}>Go back</button>
            <button type="button" className="btn btn-danger" onClick={confirmCancel} disabled={busy}>{busy && <span className="spinner-border spinner-border-sm me-2" />}Cancel booking</button>
          </>
        )}>
        {toCancel && (
          <>
            <p>{toCancel.user_name} - {toCancel.room_name}, {fmtDate(toCancel.booking_date)}, {fmtTime(toCancel.start_time)} - {fmtTime(toCancel.end_time)}. The user will be notified.</p>
            <Field label="Reason (optional)" name="reason" maxLength="120" placeholder="e.g. Room needed for an event" value={reason} onChange={(e) => setReason(e.target.value)} className="mb-0" />
          </>
        )}
      </Modal>
    </>
  );
}
