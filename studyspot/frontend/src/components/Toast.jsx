// Toast.jsx - small pop-up messages.   const toast = useToast();  toast.success('Saved');  toast.error('Failed');
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

const ICONS = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const remove = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const add = useCallback((type, message) => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list, { id, type, message }]);
    setTimeout(() => remove(id), type === 'error' ? 7000 : 4500);
  }, [remove]);

  const api = useMemo(() => ({
    success: (m) => add('success', m),
    error: (m) => add('error', m),
    info: (m) => add('info', m),
  }), [add]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast-item toast-${t.type}`} role="status">
            <i className={`fa-solid ${ICONS[t.type]} me-2`} />
            <span className="flex-grow-1">{t.message}</span>
            <button type="button" className="btn-close btn-close-sm ms-3" aria-label="Close" onClick={() => remove(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
