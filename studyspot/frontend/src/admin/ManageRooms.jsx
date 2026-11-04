// ManageRooms.jsx - add, edit, delete and search rooms; manage the equipment catalogue.
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { ConfirmModal, EmptyState, ErrorBox, Field, Loading, Modal, PageHeader, StatusBadge } from '../components/ui';
import { errorMessage } from '../utils';

const EMPTY_FORM = { room_name: '', building: '', floor_no: 0, capacity: 4, description: '', status: 'available', equipment: {} };

export default function ManageRooms() {
  const toast = useToast();
  const [rooms, setRooms] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(null);       // null = closed, 'new' or a room object
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [newEquipment, setNewEquipment] = useState('');
  const [equipError, setEquipError] = useState('');
  const [equipToDelete, setEquipToDelete] = useState(null);

  const load = useCallback(async (search = q) => {
    setError('');
    try {
      const [r, e] = await Promise.all([api.get('/admin/rooms', { q: search }), api.get('/admin/equipment')]);
      setRooms(r);
      setEquipment(e);
    } catch (err) { setError(errorMessage(err)); }
  }, [q]);
  useEffect(() => { load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openForm = (room) => {
    setErrors({});
    setFormError('');
    if (room === 'new') setForm(EMPTY_FORM);
    else {
      setForm({
        room_name: room.room_name, building: room.building, floor_no: room.floor_no, capacity: room.capacity,
        description: room.description || '', status: room.status,
        equipment: Object.fromEntries(room.equipment.map((x) => [x.equipment_id, x.quantity])),
      });
    }
    setEditing(room);
  };

  const change = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((er) => ({ ...er, [e.target.name]: undefined }));
  };

  const toggleEquipment = (id) => setForm((f) => {
    const next = { ...f.equipment };
    if (next[id]) delete next[id]; else next[id] = 1;
    return { ...f, equipment: next };
  });

  const validate = () => {
    const found = {};
    if (form.room_name.trim().length < 2) found.room_name = 'Enter a room name (at least 2 characters).';
    if (!form.building.trim()) found.building = 'Enter the building.';
    if (!Number.isInteger(Number(form.floor_no))) found.floor_no = 'Floor must be a whole number (0 = ground floor).';
    const cap = Number(form.capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 500) found.capacity = 'Capacity must be a whole number from 1 to 500.';
    return found;
  };

  const save = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    const body = {
      ...form,
      floor_no: Number(form.floor_no),
      capacity: Number(form.capacity),
      equipment: Object.entries(form.equipment).map(([equipment_id, quantity]) => ({ equipment_id: Number(equipment_id), quantity: Number(quantity) || 1 })),
    };
    setBusy(true);
    try {
      const res = editing === 'new' ? await api.post('/admin/rooms', body) : await api.put(`/admin/rooms/${editing.room_id}`, body);
      toast.success(res.message);
      setEditing(null);
      load();
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(errorMessage(err));
    } finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const res = await api.del(`/admin/rooms/${toDelete.room_id}`);
      toast.success(res.message);
      load();
    } catch (err) { toast.error(errorMessage(err)); }
    setToDelete(null);
    setBusy(false);
  };

  const addEquipment = async (e) => {
    e.preventDefault();
    setEquipError('');
    if (newEquipment.trim().length < 2) return setEquipError('Enter the equipment name (at least 2 characters).');
    try {
      const res = await api.post('/admin/equipment', { equipment_name: newEquipment.trim() });
      toast.success(res.message);
      setNewEquipment('');
      return load();
    } catch (err) { return setEquipError(errorMessage(err)); }
  };

  const confirmDeleteEquipment = async () => {
    setBusy(true);
    try {
      const res = await api.del(`/admin/equipment/${equipToDelete.equipment_id}`);
      toast.success(res.message);
      load();
    } catch (err) { toast.error(errorMessage(err)); }
    setEquipToDelete(null);
    setBusy(false);
  };

  return (
    <>
      <PageHeader
        title="Manage rooms"
        icon="fa-door-open"
        subtitle="Add, change or remove study rooms."
        actions={<button type="button" className="btn btn-primary" onClick={() => openForm('new')}><i className="fa-solid fa-plus me-2" />Add new room</button>}
      />

      <form className="input-group mb-3" onSubmit={(e) => { e.preventDefault(); load(q); }} role="search">
        <input className="form-control" placeholder="Search by room name or building..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search rooms" />
        <button className="btn btn-outline-primary" type="submit"><i className="fa-solid fa-magnifying-glass" /></button>
        {q && <button className="btn btn-outline-secondary" type="button" onClick={() => { setQ(''); load(''); }}>Clear</button>}
      </form>

      <ErrorBox message={error} onRetry={() => load()} />
      {!rooms && !error && <Loading />}
      {rooms && rooms.length === 0 && <EmptyState title="No rooms found" text="Try another search or add a new room." />}
      {rooms && rooms.length > 0 && (
        <div className="table-responsive card mb-4">
          <table className="table table-hover mb-0">
            <thead><tr><th>ID</th><th>Room</th><th>Building</th><th>Floor</th><th>Capacity</th><th>Equipment</th><th>Status</th><th>Bookings</th><th className="text-end">Actions</th></tr></thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.room_id}>
                  <td>{r.room_id}</td>
                  <td className="fw-semibold">{r.room_name}</td>
                  <td>{r.building}</td>
                  <td>{r.floor_no}</td>
                  <td>{r.capacity}</td>
                  <td style={{ minWidth: 180 }}>{r.equipment.map((x) => <span key={x.equipment_id} className="chip">{x.equipment_name}</span>)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.booking_count}</td>
                  <td className="text-end text-nowrap">
                    <button type="button" className="btn btn-sm btn-outline-primary me-2" onClick={() => openForm(r)}><i className="fa-solid fa-pen" /> Edit</button>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setToDelete(r)}><i className="fa-solid fa-trash" /> Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div className="card-body">
          <h2 className="h6">Equipment catalogue</h2>
          <p className="small text-muted">Items that can be assigned to rooms.</p>
          <div className="mb-3">
            {equipment.map((x) => (
              <span key={x.equipment_id} className="chip">
                {x.equipment_name} <span className="text-muted">({x.rooms_using})</span>
                <button type="button" className="btn btn-link btn-sm p-0 ms-2 text-danger" aria-label={`Delete ${x.equipment_name}`} onClick={() => setEquipToDelete(x)}>
                  <i className="fa-solid fa-xmark" />
                </button>
              </span>
            ))}
          </div>
          <form className="row g-2" onSubmit={addEquipment} noValidate>
            <div className="col-sm-6 col-md-4">
              <input className={`form-control ${equipError ? 'is-invalid' : ''}`} placeholder="New equipment, e.g. Smart board" value={newEquipment}
                onChange={(e) => { setNewEquipment(e.target.value); setEquipError(''); }} aria-label="New equipment name" />
              {equipError && <div className="invalid-feedback">{equipError}</div>}
            </div>
            <div className="col-auto"><button type="submit" className="btn btn-outline-primary">Add equipment</button></div>
          </form>
        </div>
      </div>

      <Modal
        show={!!editing}
        title={editing === 'new' ? 'Add new room' : 'Edit room'}
        onClose={() => setEditing(null)}
        size="modal-lg"
        footer={(
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
            <button type="submit" form="room-form" className="btn btn-primary" disabled={busy}>{busy && <span className="spinner-border spinner-border-sm me-2" />}Save room</button>
          </>
        )}
      >
        <form id="room-form" onSubmit={save} noValidate>
          {formError && <div className="alert alert-danger py-2">{formError}</div>}
          <div className="row">
            <div className="col-md-6"><Field label="Room name" name="room_name" required value={form.room_name} onChange={change} error={errors.room_name} /></div>
            <div className="col-md-6"><Field label="Building" name="building" required value={form.building} onChange={change} error={errors.building} /></div>
            <div className="col-6 col-md-3"><Field label="Floor" name="floor_no" type="number" value={form.floor_no} onChange={change} error={errors.floor_no} /></div>
            <div className="col-6 col-md-3"><Field label="Capacity" name="capacity" type="number" min="1" required value={form.capacity} onChange={change} error={errors.capacity} /></div>
            <div className="col-md-6">
              <Field label="Status" name="status" as="select" value={form.status} onChange={change}>
                <option value="available">Available</option>
                <option value="maintenance">Maintenance (cannot be booked)</option>
              </Field>
            </div>
          </div>
          <Field label="Description" name="description" as="textarea" rows="2" maxLength="255" value={form.description} onChange={change} />
          <div className="fw-semibold small mb-2">Equipment in this room</div>
          <div className="row g-2">
            {equipment.map((x) => (
              <div className="col-sm-6 col-md-4" key={x.equipment_id}>
                <div className="d-flex align-items-center gap-2 border rounded p-2">
                  <input type="checkbox" className="form-check-input mt-0" id={`eq-${x.equipment_id}`} checked={!!form.equipment[x.equipment_id]} onChange={() => toggleEquipment(x.equipment_id)} />
                  <label htmlFor={`eq-${x.equipment_id}`} className="small flex-grow-1">{x.equipment_name}</label>
                  {form.equipment[x.equipment_id] && (
                    <input type="number" min="1" max="100" className="form-control form-control-sm" style={{ width: 62 }} aria-label={`Quantity of ${x.equipment_name}`}
                      value={form.equipment[x.equipment_id]} onChange={(e) => setForm((f) => ({ ...f, equipment: { ...f.equipment, [x.equipment_id]: e.target.value } }))} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </form>
      </Modal>

      <ConfirmModal show={!!toDelete} title="Delete this room?" danger confirmText="Delete room" busy={busy} onConfirm={confirmDelete} onCancel={() => setToDelete(null)}
        message={toDelete && `"${toDelete.room_name}" will be removed permanently. Rooms with booking history cannot be deleted.`} />
      <ConfirmModal show={!!equipToDelete} title="Delete equipment?" danger confirmText="Delete" busy={busy} onConfirm={confirmDeleteEquipment} onCancel={() => setEquipToDelete(null)}
        message={equipToDelete && `"${equipToDelete.equipment_name}" will be removed from ${equipToDelete.rooms_using} room(s).`} />
    </>
  );
}
