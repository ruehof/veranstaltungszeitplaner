// Wrapper für asynchrone Express-Handler: reicht abgelehnte Promises an next() weiter,
// damit die zentrale Fehler-Middleware greift (Express 4 fängt async-Fehler nicht selbst).
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
