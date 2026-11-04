// http.js - small helpers for consistent error handling in every route.

/** An error that is safe to show to the user (has an HTTP status and a friendly message). */
class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields; // optional: { fieldName: 'message' } for form validation
  }
}

/** Wraps an async route so any thrown error reaches the error handler. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Final error handler: friendly messages for users, details only in the server log. */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, fields: err.fields });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request contained invalid data.' });
  }
  console.error('Unexpected error:', err);
  return res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}

module.exports = { HttpError, asyncHandler, errorHandler };
