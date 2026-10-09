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

// Domain errors of the SuperApp features. Both stores throw the same ones and
// the API maps each to one status and code (lib/api/handler.ts).

/** 402 insufficient_funds: the sender's available credits don't cover the amount. */
export class InsufficientFundsError extends Error {
  constructor(
    readonly available: number,
    readonly required: number
  ) {
    super("Not enough credits available");
    this.name = "InsufficientFundsError";
  }
}

/** 403 wallet_frozen: a moderator froze this wallet. */
export class WalletFrozenError extends Error {
  constructor(readonly username: string) {
    super(`@${username}'s wallet is frozen`);
    this.name = "WalletFrozenError";
  }
}

/** 403 forbidden: visible, but not something this user may do. */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** 422 limit_exceeded: an amount, count or capacity limit. */
export class LimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitExceededError";
  }
}

/** 422 unavailable: closed, paused, sold out...; `productIds` names the lines at fault. */
export class UnavailableError extends Error {
  constructor(
    message: string,
    readonly productIds: string[] = []
  ) {
    super(message);
    this.name = "UnavailableError";
  }
}

/** 422 idempotency_key_reused: the key was already used with a different body. */
export class IdempotencyKeyReusedError extends Error {
  constructor(
    message = "This Idempotency-Key was already used for a different request"
  ) {
    super(message);
    this.name = "IdempotencyKeyReusedError";
  }
}

/** 409 invalid_state: the record is not in a state that allows this action. */
export class InvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStateError";
  }
}

/** 409 price_changed: the client's expected total or fare is out of date. */
export class PriceChangedError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number
  ) {
    super("Prices changed. Review your order.");
    this.name = "PriceChangedError";
  }
}

/** 409 conflict: a concurrent write won (a taken handle, or retries ran out). */
export class ConflictError extends Error {
  constructor(message = "Busy, try again") {
    super(message);
    this.name = "ConflictError";
  }
}

/** 501 not_implemented: the feature's lane has not shipped yet. */
export class NotImplementedError extends Error {
  constructor(message = "This feature is not available yet") {
    super(message);
    this.name = "NotImplementedError";
  }
}
