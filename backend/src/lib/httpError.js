// Fehlerklasse mit HTTP-Statuscode für die zentrale Fehlerbehandlung.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
