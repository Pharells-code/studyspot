// BookRoom.jsx - the booking form (the system's main transaction).
// Create mode:  /rooms/:id/book?date=..&start=..&end=..
// Edit mode:    /rooms/:id/book?edit=<bookingId>   (saves with PUT instead of POST)
// Shows the room's availability for the chosen day and checks the booking rules
// before sending; the server repeats every check, so nothing can slip through.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { ErrorBox, Field, Loading, PageHeader } from '../components/ui';
import { addDaysStr, errorMessage, fmtDate, hoursBetween, timeOptions, todayStr } from '../utils';

const FIRST_HOUR = 7;      // the availability strip shows the hours 07:00 .. 20:00
const HOURS = Array.from({ length: 14 }, (_, i) => FIRST_HOUR + i);
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export default function BookRoom() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const navigate = useNavigate();
  const toast = useToast();

  const [room, setRoom] = useState(null);
  const [meta, setMeta] = useState(null);
  const [slots, setSlots] = useState([]);
  const [form, setForm] = useState({
    booking_date: params.get('date') || todayStr(),
    start_time: params.get('start') || '09:00',
    end_time: params.get('end') || '11:00',
    purpose: '',
    attendees: 1,
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);

  // load the room, the booking rules and (in edit mode) the existing booking
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, m] = await Promise.all([api.get(`/rooms/${id}`), api.get('/rooms/meta')]);
        if (cancelled) return;
        setRoom(r);
        setMeta(m);
        if (editId) {
          const b = await api.get(`/bookings/${editId}`);
          if (cancelled) return;
          setForm({
            booking_date: b.booking_date, start_time: b.start_time.slice(0, 5), end_time: b.end_time.slice(0, 5),
            purpose: b.purpose || '', attendees: b.attendees,
          });
        }
      } catch (e) {
        if (!cancelled) setLoadError(errorMessage(e));
      }
    })();
    return () => { cancelled = true; };
  }, [id, editId]);

  // the times already taken on the chosen day
  const loadSlots = useCallback(async () => {
    if (!form.booking_date) return;
    try {
      const all = await api.get(`/rooms/${id}/slots`, { date: form.booking_date });
      // in edit mode the user's own booking should not show as "taken"
      setSlots(all);
    } catch (e) {
      setSlots([]);
    }
  }, [id, form.booking_date]);
  useEffect(() => { loadSlots(); }, [loadSlots]);

  const rules = meta && meta.rules;

  /** Same rules as the server (bookingService.checkTimeRules), so mistakes show up immediately. */
  const validate = () => {
    const found = {};
    const { booking_date: date, start_time: start, end_time: end } = form;
    const attendees = Number(form.attendees);
    if (!date) found.booking_date = 'Please choose a date.';
    else if (date < todayStr()) found.booking_date = 'You cannot book a date that has already passed.';
    else if (date > addDaysStr(todayStr(), rules.maxAdvanceDays)) found.booking_date = `Rooms can only be booked up to ${rules.maxAdvanceDays} days ahead.`;
    if (end <= start) found.end_time = 'End time must be after the start time.';
    else {
      const minutes = toMin(end) - toMin(start);
      if (minutes < rules.minMinutes) found.end_time = `A booking must be at least ${rules.minMinutes} minutes.`;
      if (minutes > rules.maxHours * 60) found.end_time = `A booking can be at most ${rules.maxHours} hours.`;
    }
    if (date === todayStr() && !found.start_time && new Date(`${date}T${start}:00`).getTime() <= Date.now()) {
      found.start_time = 'That start time has already passed. Please choose a later time.';
    }
    if (!Number.isInteger(attendees) || attendees < 1) found.attendees = 'Enter the number of people (1 or more).';
    else if (attendees > room.capacity) found.attendees = `This room holds at most ${room.capacity} people.`;
    return found;
  };

  const change = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((er) => ({ ...er, [e.target.name]: undefined }));
    setServerError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setServerError('');
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const body = { ...form, room_id: Number(id), attendees: Number(form.attendees) };
      const res = editId ? await api.put(`/bookings/${editId}`, body) : await api.post('/bookings', body);
      toast.success(res.message);
      navigate('/my-bookings');
    } catch (err) {
      setServerError(errorMessage(err));
      setErrors(err.fields || {});
      if (err.status === 409) loadSlots();        // somebody else got the slot: refresh the strip
      setBusy(false);
    }
  };

  // availability strip: which of the 14 hours are taken / selected
  const strip = useMemo(() => HOURS.map((h) => {
    const from = h * 60;
    const to = from + 60;
    const taken = slots.some((s) => toMin(s.start_time) < to && toMin(s.end_time) > from);
    const mine = form.end_time > form.start_time && toMin(form.start_time) < to && toMin(form.end_time) > from;
    return { h, className: taken ? 'taken' : mine ? 'mine' : '' };
  }), [slots, form.start_time, form.end_time]);

  if (loadError) return <ErrorBox message={loadError} />;
  if (!room || !meta) return <Loading text="Loading room..." />;

  const times = timeOptions(rules.openTime, rules.closeTime, rules.slotMinutes);
  const duration = form.end_time > form.start_time ? hoursBetween(form.start_time, form.end_time) : 0;

  return (
    <>
      <PageHeader
        title={editId ? `Edit booking #${editId}` : 'Book a room'}
        icon="fa-calendar-plus"
        subtitle={`${room.room_name} - ${fmtDate(form.booking_date)}`}
      />
      <div className="row g-4">
        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-body">
              <h2 className="h5">{room.room_name}</h2>
              <p className="text-muted small mb-2">
                <i className="fa-solid fa-building me-1" />{room.building}, floor {room.floor_no}<br />
                <i className="fa-solid fa-user-group me-1" />Capacity: {room.capacity} people
              </p>
              {room.description && <p className="small">{room.description}</p>}
              <div className="fw-semibold small mb-1">Equipment</div>
              {room.equipment.length === 0 && <span className="text-muted small">None listed</span>}
              {room.equipment.map((x) => (
                <span key={x.equipment_id} className="chip">{x.equipment_name}{x.quantity > 1 ? ` x${x.quantity}` : ''}</span>
              ))}
              {room.status !== 'available' && (
                <div className="alert alert-warning mt-3 mb-0 small">This room is under maintenance and cannot be booked right now.</div>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-8">
          <form className="card" onSubmit={submit} noValidate>
            <div className="card-body">
              {serverError && <div className="alert alert-danger" role="alert"><i className="fa-solid fa-circle-exclamation me-2" />{serverError}</div>}
              <div className="row">
                <div className="col-md-4">
                  <Field label="Date" name="booking_date" type="date" required value={form.booking_date} onChange={change}
                    min={todayStr()} max={addDaysStr(todayStr(), rules.maxAdvanceDays)} error={errors.booking_date} />
                </div>
                <div className="col-6 col-md-4">
                  <Field label="Start time" name="start_time" as="select" required value={form.start_time} onChange={change} error={errors.start_time}>
                    {times.slice(0, -1).map((t) => <option key={t} value={t}>{t}</option>)}
                  </Field>
                </div>
                <div className="col-6 col-md-4">
                  <Field label="End time" name="end_time" as="select" required value={form.end_time} onChange={change} error={errors.end_time}>
                    {times.slice(1).map((t) => <option key={t} value={t}>{t}</option>)}
                  </Field>
                </div>
              </div>

              <div className="mb-3">
                <div className="small fw-semibold mb-1">Availability on {fmtDate(form.booking_date)}</div>
                <div className="slot-strip" aria-label="Hourly availability">
                  {strip.map((s) => <div key={s.h} className={`slot ${s.className}`} title={`${String(s.h).padStart(2, '0')}:00`} />)}
                </div>
                <div className="slot-labels">{HOURS.map((h) => <span key={h}>{String(h).padStart(2, '0')}</span>)}</div>
                <div className="small text-muted mt-2 d-flex gap-3 flex-wrap">
                  <span><span className="chip" style={{ background: '#cfe9d6', color: '#1e5b34' }}>Free</span></span>
                  <span><span className="chip" style={{ background: '#f2b8b5', color: '#7a1f1a' }}>Taken</span></span>
                  <span><span className="chip" style={{ background: '#a8c7e6', color: '#143d63' }}>Your selection</span></span>
                </div>
              </div>

              {duration > 0 && (
                <p className="small text-muted">Duration: <strong>{duration} hour{duration === 1 ? '' : 's'}</strong></p>
              )}
              {duration > rules.approvalAfterHours && (
                <div className="alert alert-info py-2 small">
                  <i className="fa-solid fa-circle-info me-2" />
                  Bookings longer than {rules.approvalAfterHours} hours must be approved by an administrator.
                </div>
              )}

              <div className="row">
                <div className="col-md-4">
                  <Field label="Number of attendees" name="attendees" type="number" min="1" max={room.capacity} required
                    value={form.attendees} onChange={change} error={errors.attendees} help={`Maximum ${room.capacity}`} />
                </div>
                <div className="col-md-8">
                  <Field label="Purpose (optional)" name="purpose" as="textarea" rows="2" maxLength="255"
                    placeholder="e.g. Group project meeting" value={form.purpose} onChange={change} error={errors.purpose} />
                </div>
              </div>
            </div>
            <div className="card-footer bg-transparent d-flex gap-2 justify-content-end">
              <button type="button" className="btn btn-outline-secondary" onClick={() => navigate(-1)} disabled={busy}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy || room.status !== 'available'}>
                {busy && <span className="spinner-border spinner-border-sm me-2" />}
                {editId ? 'Save changes' : 'Confirm booking'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
