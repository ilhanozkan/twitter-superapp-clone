/** The tweet (or other record) an operation targets does not exist or is hidden. */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** The data source is not configured for the requested operation (e.g. writing without a token). */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}
