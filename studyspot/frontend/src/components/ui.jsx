// ui.jsx - small shared building blocks so every page looks and behaves the same.
import React, { useEffect } from 'react';

/** Page title bar:  <PageHeader title="Rooms" subtitle="..." actions={<button/>} /> */
export function PageHeader({ title, subtitle, icon, actions }) {
  return (
    <div className="page-header d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      <div>
        <h1 className="h3 mb-0 page-title">{icon && <i className={`fa-solid ${icon} me-2`} />}{title}</h1>
        {subtitle && <p className="text-muted mb-0 small">{subtitle}</p>}
      </div>
      {actions && <div className="d-flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Loading({ text = 'Loading...' }) {
  return (
    <div className="text-center text-muted py-5">
      <div className="spinner-border spinner-border-sm me-2" role="status" />{text}
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="alert alert-danger d-flex align-items-center justify-content-between" role="alert">
      <span><i className="fa-solid fa-triangle-exclamation me-2" />{message}</span>
      {onRetry && <button type="button" className="btn btn-sm btn-outline-danger" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ icon = 'fa-folder-open', title, text }) {
  return (
    <div className="text-center text-muted py-5">
      <i className={`fa-regular ${icon} fa-2x mb-2`} />
      <div className="fw-semibold">{title}</div>
      {text && <div className="small">{text}</div>}
    </div>
  );
}

const STATUS_STYLE = {
  available: 'success', confirmed: 'success', completed: 'secondary', active: 'success',
  pending: 'warning', maintenance: 'warning', suspended: 'danger', cancelled: 'danger', booked: 'danger',
};
const STATUS_LABEL = { booked: 'Booked' };

/** Coloured pill for booking / room / user statuses. */
export function StatusBadge({ status }) {
  const colour = STATUS_STYLE[status] || 'secondary';
  const label = STATUS_LABEL[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : '');
  return <span className={`badge status-badge bg-${colour}-subtle text-${colour}-emphasis border border-${colour}-subtle`}>{label}</span>;
}

/**
 * Form field with label, validation message and help text.
 * <Field label="Email" name="email" type="email" value={v} onChange={(e)=>...} error={errors.email} required />
 * as="select" (give <option> children) or as="textarea" are supported.
 */
export function Field({ label, name, as = 'input', error, help, required, className = '', children, ...rest }) {
  const Tag = as;
  const cls = as === 'select' ? 'form-select' : 'form-control';
  return (
    <div className={`mb-3 ${className}`}>
      {label && <label htmlFor={name} className="form-label fw-semibold small mb-1">{label}{required && <span className="text-danger"> *</span>}</label>}
      <Tag id={name} name={name} className={`${cls} ${error ? 'is-invalid' : ''}`} aria-invalid={!!error} {...rest}>{children}</Tag>
      {error && <div className="invalid-feedback d-block">{error}</div>}
      {help && !error && <div className="form-text">{help}</div>}
    </div>
  );
}

/** Generic modal dialog. <Modal show title onClose footer={<buttons/>}>content</Modal> */
export function Modal({ show, title, onClose, footer, children, size = '' }) {
  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('modal-open'); };
  }, [show, onClose]);

  if (!show) return null;
  return (
    <>
      <div className="modal-backdrop fade show" onClick={onClose} />
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" onClick={onClose}>
        <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${size}`} onClick={(e) => e.stopPropagation()}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h5">{title}</h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
    </>
  );
}

/** "Are you sure?" dialog for deleting / cancelling. */
export function ConfirmModal({ show, title = 'Are you sure?', message, confirmText = 'Confirm', danger = false, busy = false, onConfirm, onCancel, children }) {
  return (
    <Modal
      show={show}
      title={title}
      onClose={onCancel}
      footer={(
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>Go back</button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy && <span className="spinner-border spinner-border-sm me-2" />}{confirmText}
          </button>
        </>
      )}
    >
      {message && <p className="mb-0">{message}</p>}
      {children}
    </Modal>
  );
}
