// Dashboard.jsx - admin home: key numbers, bookings per day (bar chart) and the latest bookings.
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ErrorBox, Loading, PageHeader, StatusBadge } from '../components/ui';
import { errorMessage, fmtTime } from '../utils';

const STAT_CARDS = [
  ['rooms', 'Total rooms', 'fa-door-open'],
  ['bookingsToday', 'Bookings today', 'fa-calendar-day'],
  ['activeUsers', 'Active users', 'fa-users'],
  ['cancelledWeek', 'Cancelled (7 days)', 'fa-ban'],
];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setStats(await api.get('/admin/stats')); } catch (e) { setError(errorMessage(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!stats) return <Loading />;

  const max = Math.max(1, ...stats.perDay.map((d) => d.count));
  const dayLabel = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });

  return (
    <>
      <PageHeader
        title="Dashboard"
        icon="fa-gauge-high"
        subtitle="A quick look at how StudySpot is being used."
        actions={<button type="button" className="btn btn-outline-primary" onClick={load}><i className="fa-solid fa-rotate me-2" />Refresh</button>}
      />

      {stats.pending > 0 && (
        <div className="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
          <span><i className="fa-solid fa-hourglass-half me-2" /><strong>{stats.pending}</strong> booking{stats.pending === 1 ? ' is' : 's are'} waiting for your approval.</span>
          <Link to="/admin/bookings?status=pending" className="btn btn-sm btn-warning">Review now</Link>
        </div>
      )}

      <div className="row g-3 mb-4">
        {STAT_CARDS.map(([key, label, icon]) => (
          <div className="col-6 col-xl-3" key={key}>
            <div className="card stat-card h-100">
              <div className="card-body d-flex align-items-center justify-content-between">
                <div>
                  <div className="text-muted small">{label}</div>
                  <div className="stat-num">{stats[key]}</div>
                </div>
                <div className="stat-icon"><i className={`fa-solid ${icon}`} /></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card h-100">
            <div className="card-body">
              <h2 className="h6 mb-2">Bookings per day (last 7 days)</h2>
              <div className="bar-chart" role="img" aria-label="Bar chart of bookings per day">
                {stats.perDay.map((d) => (
                  <div className="bar-col" key={d.date}>
                    <div className="bar-value">{d.count}</div>
                    <div className="bar" style={{ height: `${(d.count / max) * 100}%` }} />
                    <div className="bar-label">{dayLabel(d.date)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card h-100">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h2 className="h6 mb-0">Latest bookings</h2>
                <Link to="/admin/bookings" className="small">View all</Link>
              </div>
              <div className="table-responsive">
                <table className="table table-sm table-hover mb-0">
                  <thead><tr><th>#</th><th>User</th><th>Room</th><th>When</th><th>Status</th></tr></thead>
                  <tbody>
                    {stats.latest.map((b) => (
                      <tr key={b.booking_id}>
                        <td>{b.booking_id}</td>
                        <td>{b.user_name}</td>
                        <td>{b.room_name}</td>
                        <td className="text-nowrap">{b.booking_date.slice(5)} {fmtTime(b.start_time)}-{fmtTime(b.end_time)}</td>
                        <td><StatusBadge status={b.status} /></td>
                      </tr>
                    ))}
                    {stats.latest.length === 0 && <tr><td colSpan="5" className="text-center text-muted">No bookings yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
