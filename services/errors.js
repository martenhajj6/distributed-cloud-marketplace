// An error that carries the HTTP status and JSON body the route should answer with.
class HttpError extends Error {
  constructor(status, body) {
    const payload = typeof body === "string" ? { error: body } : body;
    super(payload.error || "Request failed");
    this.status = status;
    this.body = payload;
  }
}

// Use in a route's catch block: known errors keep their status, anything else becomes a 500.
function sendError(res, error, fallbackMessage) {
  if (error instanceof HttpError) return res.status(error.status).json(error.body);
  console.error(error);
  return res.status(500).json({ error: fallbackMessage });
}

module.exports = { HttpError, sendError };
