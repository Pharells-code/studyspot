// api.js - the ONLY place that talks to the Express server.
// Usage:  const rooms = await api.get('/rooms', { capacity: 4 });
//         await api.post('/bookings', { room_id: 1, ... });
// Errors are thrown as ApiError with a friendly `message`, the HTTP `status`,
// and (for forms) `fields` = { fieldName: 'message' }.

const TOKEN_KEY = 'studyspot_token';

export const tokenStore = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } },
  set(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* ignore */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } },
};

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

async function request(method, path, { params, body } = {}) {
  let url = `/api${path}`;
  if (params) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const text = qs.toString();
    if (text) url += `?${text}`;
  }

  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new ApiError('Cannot reach the server. Check that the StudySpot server is running and try again.', 0);
  }

  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }

  if (!res.ok) {
    // a rejected token anywhere in the app logs the user out
    if (res.status === 401 && token) window.dispatchEvent(new Event('studyspot:unauthorized'));
    throw new ApiError((data && data.error) || `Request failed (${res.status}).`, res.status, data && data.fields);
  }
  return data;
}

export const api = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body = {}) => request('POST', path, { body }),
  put: (path, body = {}) => request('PUT', path, { body }),
  del: (path) => request('DELETE', path),
};
