// MyBookings.jsx - the user's own bookings in three tabs (Upcoming / Past / Cancelled),
// with Edit and Cancel for upcoming ones.
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { ConfirmModal, EmptyState, ErrorBox, Loading, PageHeader, StatusBadge } from '../components/ui';
import { errorMessage, fmtDate, fmtTime } from '../utils';

const TABS = [['upcoming', 'Upcoming'], ['past', 'Past'], ['cancelled', 'Cancelled']];

export default function MyBookings() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState('upcoming');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [toCancel, setToCancel] = useState(null);   // the booking waiting for confirmation
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    setError('');
    try {
      setRows(await api.get('/bookings/mine', { tab }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const confirmCancel = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/bookings/${toCancel.booking_id}/cancel`);
      toast.success(res.message);
      setToCancel(null);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
      setToCancel(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="My bookings"
        icon="fa-calendar-check"
        subtitle="Change or cancel your upcoming reservations."
        actions={<Link to="/rooms" className="btn btn-primary"><i className="fa-solid fa-plus me-2" />Book a room</Link>}
      />

      <ul className="nav nav-tabs mb-3">
        {TABS.map(([key, label]) => (
          <li className="nav-item" key={key}>
            <button type="button" className={`nav-link ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
          </li>
        ))}
      </ul>

      <ErrorBox message={error} onRetry={load} />
      {rows === null && !error && <Loading text="Loading your bookings..." />}
      {rows && rows.length === 0 && (
        <EmptyState
          icon="fa-calendar"
          title={`No ${tab} bookings`}
          text={tab === 'upcoming' ? 'Find a free room and book it in a few clicks.' : undefined}
        />
      )}

      {rows && rows.length > 0 && (
        <div className="table-responsive card">
          <table className="table table-hover mb-0">
            <thead>
              <tr><th>Booking</th><th>Room</th><th>Date</th><th>Time</th><th>People</th><th>Status</th>{tab === 'upcoming' && <th className="text-end">Actions</th>}</tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.booking_id}>
                  <td className="fw-semibold">#{b.booking_id}</td>
                  <td>{b.room_name}<div className="small text-muted">{b.building}</div></td>
                  <td>{fmtDate(b.booking_date)}</td>
                  <td>{fmtTime(b.start_time)} - {fmtTime(b.end_time)}</td>
                  <td>{b.attendees}</td>
                  <td>
                    <StatusBadge status={b.status} />
                    {b.status === 'pending' && <div className="small text-muted mt-1">Waiting for administrator approval</div>}
                  </td>
                  {tab === 'upcoming' && (
                    <td className="text-end text-nowrap">
                      <button type="button" className="btn btn-sm btn-outline-primary me-2" onClick={() => navigate(`/rooms/${b.room_id}/book?edit=${b.booking_id}`)}>
                        <i className="fa-solid fa-pen me-1" />Edit
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setToCancel(b)}>
                        <i className="fa-solid fa-xmark me-1" />Cancel
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        show={!!toCancel}
        title="Cancel this booking?"
        message={toCancel && `${toCancel.room_name} on ${fmtDate(toCancel.booking_date)}, ${fmtTime(toCancel.start_time)} - ${fmtTime(toCancel.end_time)}. The room will become available to others.`}
        confirmText="Yes, cancel booking"
        danger
        busy={busy}
        onConfirm={confirmCancel}
        onCancel={() => setToCancel(null)}
      />
    </>
  );
}
