// RoomSearch.jsx - "Find a study room": filter by date, time, capacity and equipment,
// then see every matching room with its availability for the chosen time window.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { EmptyState, ErrorBox, Field, Loading, PageHeader, StatusBadge } from '../components/ui';
import { addDaysStr, errorMessage, fmtDate, timeOptions, todayStr } from '../utils';

const DEFAULT_FILTERS = { q: '', date: todayStr(), start: '09:00', end: '11:00', capacity: '', equipment: '' };

export default function RoomSearch() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);          // booking rules + equipment list
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [rooms, setRooms] = useState(null);        // null = not loaded yet
  const [searched, setSearched] = useState(DEFAULT_FILTERS); // the filters used for the shown results
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (f) => {
    setBusy(true);
    setError('');
    try {
      const data = await api.get('/rooms', {
        q: f.q.trim(), capacity: f.capacity, equipment: f.equipment, date: f.date, start: f.start, end: f.end,
      });
      setRooms(data);
      setSearched(f);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);

  // first load: rules for the dropdowns, then the first search
  useEffect(() => {
    api.get('/rooms/meta').then(setMeta).catch((e) => setError(errorMessage(e)));
    search(DEFAULT_FILTERS);
  }, [search]);

  const change = (e) => {
    setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));
    setFormError('');
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!filters.date) return setFormError('Please choose a date.');
    if (filters.end <= filters.start) return setFormError('The end time must be after the start time.');
    if (filters.capacity && Number(filters.capacity) < 1) return setFormError('Capacity must be 1 or more.');
    return search(filters);
  };

  const reset = () => { setFilters(DEFAULT_FILTERS); setFormError(''); search(DEFAULT_FILTERS); };

  const times = meta ? timeOptions(meta.rules.openTime, meta.rules.closeTime, meta.rules.slotMinutes) : [];
  const maxDate = meta ? addDaysStr(todayStr(), meta.rules.maxAdvanceDays) : undefined;

  const book = (room) => {
    const q = new URLSearchParams({ date: searched.date, start: searched.start, end: searched.end });
    navigate(`/rooms/${room.room_id}/book?${q.toString()}`);
  };

  return (
    <>
      <PageHeader title="Find a study room" icon="fa-magnifying-glass" subtitle="Choose a date and time to see which rooms are free." />

      <form className="card card-body mb-4" onSubmit={onSubmit} noValidate>
        <div className="row g-3">
          <div className="col-6 col-lg-2">
            <Field label="Date" name="date" type="date" value={filters.date} min={todayStr()} max={maxDate} onChange={change} required className="mb-0" />
          </div>
          <div className="col-6 col-lg-2">
            <Field label="From" name="start" as="select" value={filters.start} onChange={change} className="mb-0">
              {times.slice(0, -1).map((t) => <option key={t} value={t}>{t}</option>)}
            </Field>
          </div>
          <div className="col-6 col-lg-2">
            <Field label="To" name="end" as="select" value={filters.end} onChange={change} className="mb-0">
              {times.slice(1).map((t) => <option key={t} value={t}>{t}</option>)}
            </Field>
          </div>
          <div className="col-6 col-lg-2">
            <Field label="Min. capacity" name="capacity" type="number" min="1" placeholder="Any" value={filters.capacity} onChange={change} className="mb-0" />
          </div>
          <div className="col-6 col-lg-2">
            <Field label="Equipment" name="equipment" as="select" value={filters.equipment} onChange={change} className="mb-0">
              <option value="">Any</option>
              {meta && meta.equipment.map((x) => <option key={x.equipment_id} value={x.equipment_id}>{x.equipment_name}</option>)}
            </Field>
          </div>
          <div className="col-6 col-lg-2">
            <Field label="Room or building" name="q" placeholder="e.g. Library" value={filters.q} onChange={change} className="mb-0" />
          </div>
        </div>
        {formError && <div className="alert alert-warning py-2 mt-3 mb-0" role="alert">{formError}</div>}
        <div className="d-flex gap-2 mt-3">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="fa-solid fa-magnifying-glass me-2" />}Search
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={reset} disabled={busy}>Reset</button>
        </div>
      </form>

      <ErrorBox message={error} onRetry={() => search(filters)} />
      {rooms === null && !error && <Loading text="Finding rooms..." />}

      {rooms && (
        <>
          <p className="text-muted small mb-3">
            {rooms.length} room{rooms.length === 1 ? '' : 's'} found for {fmtDate(searched.date)}, {searched.start}-{searched.end}
            {' '}({rooms.filter((r) => r.availability === 'available').length} available)
          </p>
          {rooms.length === 0 && (
            <EmptyState icon="fa-face-frown" title="No rooms match your search" text="Try a different time, a smaller capacity or clear the equipment filter." />
          )}
          <div className="row g-3">
            {rooms.map((room) => (
              <div className="col-md-6 col-xl-4" key={room.room_id}>
                <div className="card h-100 shadow-hover">
                  <div className="card-body d-flex flex-column">
                    <div className="d-flex justify-content-between align-items-start mb-1">
                      <h2 className="h5 mb-0">{room.room_name}</h2>
                      <StatusBadge status={room.availability} />
                    </div>
                    <div className="text-muted small mb-2">
                      <i className="fa-solid fa-building me-1" />{room.building}, floor {room.floor_no}
                      <span className="mx-2">|</span>
                      <i className="fa-solid fa-user-group me-1" />Up to {room.capacity}
                    </div>
                    {room.description && <p className="small mb-2">{room.description}</p>}
                    <div className="mb-3">
                      {room.equipment.map((x) => <span key={x} className="chip">{x}</span>)}
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary mt-auto"
                      disabled={room.availability !== 'available'}
                      onClick={() => book(room)}
                    >
                      {room.availability === 'available' && <><i className="fa-solid fa-calendar-plus me-2" />Book now</>}
                      {room.availability === 'booked' && 'Booked at this time'}
                      {room.availability === 'maintenance' && 'Under maintenance'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
