// Reports.jsx - report generator. Choose a report type, dates, room, status and sorting,
// then print it (or save as PDF) or export it to CSV. Every report carries the university
// name, a logo block and the date it was generated.
import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { EmptyState, ErrorBox, Field, Loading, PageHeader } from '../components/ui';
import { addDaysStr, downloadCsv, errorMessage, fmtDate, fmtTime, todayStr } from '../utils';

const SORTS = {
  usage: [['room', 'Room name'], ['bookings', 'Number of bookings'], ['hours', 'Hours booked'], ['utilisation', 'Utilisation %'], ['cancelled', 'Cancellations']],
  bookings: [['date', 'Date'], ['user', 'User'], ['room', 'Room'], ['status', 'Status']],
};

// heading and cell formatting for each report column
const HEADINGS = {
  room: 'Room', building: 'Building', capacity: 'Capacity', bookings: 'Bookings', cancelled: 'Cancelled', hours: 'Hours booked',
  utilisation: 'Utilisation', booking_id: 'Booking #', date: 'Date', start_time: 'From', end_time: 'To', user: 'User',
  id_number: 'ID number', attendees: 'People', status: 'Status',
};
const CELL = {
  utilisation: (v) => `${v}%`,
  date: (v) => fmtDate(v),
  start_time: (v) => fmtTime(v),
  end_time: (v) => fmtTime(v),
  booking_id: (v) => `#${v}`,
  status: (v) => v.charAt(0).toUpperCase() + v.slice(1),
};
const show = (col, v) => (CELL[col] ? CELL[col](v) : v);

export default function Reports() {
  const { user } = useAuth();
  const toast = useToast();
  const [rooms, setRooms] = useState([]);
  const [form, setForm] = useState({ type: 'usage', from: addDaysStr(todayStr(), -29), to: todayStr(), room_id: '', status: '', sort: 'room', dir: 'asc' });
  const [formError, setFormError] = useState('');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const generate = async (f = form) => {
    setFormError('');
    if (!f.from || !f.to) return setFormError('Choose both a start and an end date.');
    if (f.from > f.to) return setFormError('The "from" date must not be after the "to" date.');
    setBusy(true);
    setError('');
    try {
      const data = await api.get(`/admin/reports/${f.type}`, {
        from: f.from, to: f.to, room_id: f.room_id, status: f.type === 'bookings' ? f.status : '', sort: f.sort, dir: f.dir,
      });
      setReport({ ...data, type: f.type });
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
    return undefined;
  };

  useEffect(() => {
    api.get('/admin/rooms').then(setRooms).catch(() => {});
    generate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const changeType = (e) => setForm((f) => ({ ...f, type: e.target.value, sort: SORTS[e.target.value][0][0], status: '' }));

  const exportCsv = () => {
    const columns = report.columns.map((c) => ({ key: c, label: HEADINGS[c] }));
    downloadCsv(`studyspot-${report.type}-report-${todayStr()}.csv`, columns, report.rows);
    toast.success('CSV file downloaded.');
  };

  const roomName = report && report.filters.room_id ? (rooms.find((r) => r.room_id === report.filters.room_id) || {}).room_name : null;
  const generated = report && new Date(report.generated_at);

  const downloadReport = () => {
    const filterStatus = "completed"; // Adjust this based on your UI later if needed
    window.open(`http://localhost:5000/api/reports/bookings?status=${filterStatus}`, '_blank');
};

  return (
    <>
      <div className="no-print">
        <PageHeader title="Reports" icon="fa-chart-column" subtitle="Generate, print or export usage reports." />

        <button onClick={downloadReport} className="btn btn-primary">
    Download PDF Report
</button>

        <form className="card card-body mb-4" onSubmit={(e) => { e.preventDefault(); generate(); }} noValidate>
          <div className="row g-2">
            <div className="col-md-3"><Field label="Report type" name="type" as="select" value={form.type} onChange={changeType} className="mb-2">
              <option value="usage">Room usage</option><option value="bookings">Bookings list</option></Field></div>
            <div className="col-6 col-md-2"><Field label="From" name="from" type="date" value={form.from} onChange={change} className="mb-2" /></div>
            <div className="col-6 col-md-2"><Field label="To" name="to" type="date" value={form.to} onChange={change} className="mb-2" /></div>
            <div className="col-md-3"><Field label="Room" name="room_id" as="select" value={form.room_id} onChange={change} className="mb-2">
              <option value="">All rooms</option>{rooms.map((r) => <option key={r.room_id} value={r.room_id}>{r.room_name}</option>)}</Field></div>
            {form.type === 'bookings' && (
              <div className="col-md-2"><Field label="Status" name="status" as="select" value={form.status} onChange={change} className="mb-2">
                <option value="">Any</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option>
                <option value="pending">Pending</option><option value="cancelled">Cancelled</option></Field></div>
            )}
            <div className="col-6 col-md-3"><Field label="Sort by" name="sort" as="select" value={form.sort} onChange={change} className="mb-2">
              {SORTS[form.type].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Field></div>
            <div className="col-6 col-md-2"><Field label="Order" name="dir" as="select" value={form.dir} onChange={change} className="mb-2">
              <option value="asc">Ascending</option><option value="desc">Descending</option></Field></div>
          </div>
          {formError && <div className="alert alert-warning py-2" role="alert">{formError}</div>}
          <div className="d-flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="fa-solid fa-file-lines me-2" />}Generate report</button>
            <button type="button" className="btn btn-outline-primary" disabled={!report} onClick={() => window.print()}><i className="fa-solid fa-print me-2" />Print / Save as PDF</button>
            <button type="button" className="btn btn-outline-primary" disabled={!report || report.rows.length === 0} onClick={exportCsv}><i className="fa-solid fa-file-csv me-2" />Export CSV</button>
          </div>
        </form>
        <ErrorBox message={error} onRetry={() => generate()} />
      </div>

      {!report && !error && <Loading text="Generating report..." />}
      {report && (
        <div className="report-sheet">
          <div className="report-head">
            <div className="report-logo" aria-label="Logo">SU</div>
            <div className="flex-grow-1">
              <div className="h5 mb-0 fw-bold">{report.organisation}</div>
              <div className="text-muted">{report.system} - Campus Study Room Booking System</div>
            </div>
            <div className="text-end small">
              <div className="fw-semibold">Date generated</div>
              <div>{generated.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              <div className="text-muted">{generated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>

          <h2 className="h4 mb-1">{report.title}</h2>
          <p className="small text-muted mb-3">
            Period: <strong>{fmtDate(report.filters.from)}</strong> to <strong>{fmtDate(report.filters.to)}</strong>
            {' | '}Room: <strong>{roomName || 'All rooms'}</strong>
            {report.type === 'bookings' && <> {' | '}Status: <strong>{report.filters.status || 'Any'}</strong></>}
            {' | '}Sorted by <strong>{(SORTS[report.type].find(([v]) => v === report.filters.sort) || [])[1]}</strong> ({report.filters.dir === 'asc' ? 'ascending' : 'descending'})
          </p>

          {report.rows.length === 0 ? (
            <EmptyState title="No data for these filters" text="Try a longer period or a different room." />
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-striped">
                <thead><tr>{report.columns.map((c) => <th key={c}>{HEADINGS[c]}</th>)}</tr></thead>
                <tbody>
                  {report.rows.map((row, i) => (
                    <tr key={row.booking_id || row.room_id || i}>
                      {report.columns.map((c) => <td key={c}>{show(c, row[c])}</td>)}
                    </tr>
                  ))}
                </tbody>
                {report.type === 'usage' && (
                  <tfoot>
                    <tr className="fw-bold">
                      <td colSpan="3">Totals</td><td>{report.totals.bookings}</td><td>{report.totals.cancelled}</td><td>{report.totals.hours}</td><td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          {report.type === 'bookings' && <p className="small fw-semibold">Total bookings listed: {report.totals.bookings}</p>}
          <hr />
          <p className="small text-muted mb-0">Report generated by StudySpot for {user.full_name} ({user.role}).</p>
        </div>
      )}
    </>
  );
}
