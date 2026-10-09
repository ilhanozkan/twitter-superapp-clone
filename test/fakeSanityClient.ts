import { evaluate, parse } from "groq-js";

import { SanityDoc, SanityMutation } from "../lib/db/sanity/ledger";
import { SanityClientLike } from "../lib/db/sanity/repository";
import { SanitySeedDocument } from "../lib/db/sanity/seed";

export type FakeDocument = SanityDoc & {
  _createdAt: string;
  _updatedAt: string;
  _rev: string;
};

type Patch = Extract<SanityMutation, { patch: unknown }>["patch"];

/**
 * Shaped like `@sanity/client`'s ClientError, so code under test can only
 * rely on what the real one offers: `statusCode` and the response body.
 */
export class FakeClientError extends Error {
  readonly statusCode: number;
  readonly response: {
    statusCode: number;
    body: {
      error: {
        type: "mutationError";
        description: string;
        items: { error: { type: string; id: string; description: string } }[];
      };
    };
  };

  constructor(statusCode: number, type: string, id: string, message: string) {
    super(message);
    this.name = "ClientError";
    this.statusCode = statusCode;
    this.response = {
      statusCode,
      body: {
        error: {
          type: "mutationError",
          description: message,
          items: [{ error: { type, id, description: message } }],
        },
      },
    };
  }
}

const strongReferences = (value: unknown, found: string[] = []): string[] => {
  if (Array.isArray(value)) {
    value.forEach((item) => strongReferences(item, found));
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record._ref === "string" && record._weak !== true)
      found.push(record._ref);
    Object.values(record).forEach((item) => strongReferences(item, found));
  }
  return found;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** The object holding the last segment of a dotted path, created on demand. */
function parentOf(
  document: Record<string, unknown>,
  path: string,
  create: boolean
): { parent: Record<string, unknown>; key: string } | null {
  const segments = path.split(".");
  const key = segments.pop()!;
  let parent = document;
  for (const segment of segments) {
    if (!isPlainObject(parent[segment])) {
      if (!create) return null;
      parent[segment] = {};
    }
    parent = parent[segment] as Record<string, unknown>;
  }
  return { parent, key };
}

/**
 * An in-memory stand-in for `@sanity/client` that runs real GROQ through
 * groq-js. `mutate` is a transaction: mutations apply in order to a staged
 * copy, strong references are checked on the result, and it commits all or
 * nothing, with the real client's error statuses (409 for an existing id or
 * a revision mismatch, 404 for patching a missing document). Every write
 * gets a fresh `_rev`. Used by tests; never by the app.
 *
 * Test hooks: `beforeMutate` (a competing write between a read and a
 * commit; writes made inside it skip the hooks), `fetchDelay` (awaited
 * after a query is evaluated, so concurrent operations all read before any
 * commits), `mutationLog`, `failNextMutate`, `injectConflicts` and
 * `anonymous` (hides path ids, as Sanity does without a token).
 */
export class FakeSanityClient implements SanityClientLike {
  documents: FakeDocument[];
  /** Reads as a request without a token: documents with a "." in their id are invisible. */
  anonymous = false;
  beforeMutate?: (mutations: SanityMutation[]) => void | Promise<void>;
  fetchDelay?: () => Promise<void>;
  /** Every committed transaction, in order. */
  readonly mutationLog: SanityMutation[][] = [];

  private readonly failures: unknown[] = [];
  private hookDepth = 0;
  private revisions = 0;
  private generatedIds = 0;

  constructor(
    documents: SanitySeedDocument[],
    private readonly now: () => Date = () => new Date()
  ) {
    this.documents = documents.map((document, index) => ({
      _updatedAt: document._createdAt,
      ...structuredClone(document),
      _rev: `seed-rev-${index + 1}`,
    }));
  }

  async fetch<T>(
    query: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const dataset = this.visible();
    const tree = parse(query, { params });
    const value = await (await evaluate(tree, { dataset, params })).get();
    await this.fetchDelay?.();
    return structuredClone(value) as T;
  }

  /** Like the real client's getDocument: undefined when missing (or hidden). */
  async getDocument(id: string): Promise<FakeDocument | undefined> {
    const document = this.visible().find((candidate) => candidate._id === id);
    return document && structuredClone(document);
  }

  async create(document: {
    _id?: string;
    _type: string;
    [field: string]: unknown;
  }) {
    const _id = document._id ?? `fake-${++this.generatedIds}`;
    await this.mutate([{ create: { ...document, _id } }]);
    return structuredClone(this.find(_id)!);
  }

  async createIfNotExists(document: {
    _id: string;
    _type: string;
    [field: string]: unknown;
  }) {
    await this.mutate([{ createIfNotExists: document }]);
    return structuredClone(this.find(document._id)!);
  }

  async delete(id: string) {
    return this.mutate([{ delete: { id } }]);
  }

  /** `options.visibility` is accepted like the real client's; every fake write is visible at once. */
  async mutate(
    mutations: SanityMutation[],
    options?: { visibility?: "sync" | "async" | "deferred" }
  ) {
    void options;
    if (this.hookDepth === 0) {
      if (this.failures.length > 0) throw this.failures.shift();
      if (this.beforeMutate) {
        this.hookDepth += 1;
        try {
          await this.beforeMutate(mutations);
        } finally {
          this.hookDepth -= 1;
        }
      }
    }

    const staged = new Map(
      this.documents.map((document) => [document._id, document])
    );
    const changed = new Set<string>();
    const deleted = new Set<string>();
    const results: { id: string; operation: string }[] = [];

    for (const mutation of mutations) {
      const [operation, id] = this.apply(staged, mutation);
      if (operation === "none") continue;
      results.push({ id, operation });
      if (operation === "delete") {
        deleted.add(id);
        changed.delete(id);
      } else {
        changed.add(id);
        deleted.delete(id);
      }
    }

    this.checkReferences(staged, changed, deleted);

    this.documents = [...staged.values()];
    this.mutationLog.push(structuredClone(mutations));
    return {
      transactionId: `fake-tx-${this.mutationLog.length}`,
      results,
    };
  }

  /** The next mutate rejects with `error`, writing nothing. */
  failNextMutate(error: unknown) {
    this.failures.push(error);
  }

  /** The next `count` mutates fail with 409, as if a concurrent write won each time. */
  injectConflicts(count: number) {
    for (let i = 0; i < count; i++) {
      this.failures.push(
        new FakeClientError(
          409,
          "documentRevisionMismatchError",
          "injected",
          "Injected conflict"
        )
      );
    }
  }

  private visible() {
    return this.anonymous
      ? this.documents.filter((document) => !document._id.includes("."))
      : this.documents;
  }

  private find(id: string) {
    return this.documents.find((document) => document._id === id);
  }

  private stamp(): { _updatedAt: string; _rev: string } {
    return {
      _updatedAt: this.now().toISOString(),
      _rev: `rev-${++this.revisions}`,
    };
  }

  private created(document: SanityDoc, createdAt?: string): FakeDocument {
    const stamp = this.stamp();
    return {
      ...structuredClone(document),
      _createdAt:
        createdAt ??
        (typeof document._createdAt === "string"
          ? document._createdAt
          : stamp._updatedAt),
      ...stamp,
    };
  }

  /** Applies one mutation to the staged documents; returns what it did and to which id. */
  private apply(
    staged: Map<string, FakeDocument>,
    mutation: SanityMutation
  ): ["create" | "update" | "delete" | "none", string] {
    if ("create" in mutation) {
      const { _id } = mutation.create;
      if (staged.has(_id)) {
        throw new FakeClientError(
          409,
          "documentAlreadyExistsError",
          _id,
          `Document "${_id}" already exists`
        );
      }
      staged.set(_id, this.created(mutation.create));
      return ["create", _id];
    }

    if ("createIfNotExists" in mutation) {
      const { _id } = mutation.createIfNotExists;
      if (staged.has(_id)) return ["none", _id];
      staged.set(_id, this.created(mutation.createIfNotExists));
      return ["create", _id];
    }

    if ("createOrReplace" in mutation) {
      const { _id } = mutation.createOrReplace;
      const existing = staged.get(_id);
      staged.set(
        _id,
        this.created(mutation.createOrReplace, existing?._createdAt)
      );
      return [existing ? "update" : "create", _id];
    }

    if ("delete" in mutation) {
      const { id } = mutation.delete;
      return staged.delete(id) ? ["delete", id] : ["none", id];
    }

    const patch = mutation.patch;
    const existing = staged.get(patch.id);
    if (!existing) {
      throw new FakeClientError(
        404,
        "documentNotFoundError",
        patch.id,
        `Document "${patch.id}" not found`
      );
    }
    if (
      patch.ifRevisionID !== undefined &&
      patch.ifRevisionID !== existing._rev
    ) {
      throw new FakeClientError(
        409,
        "documentRevisionMismatchError",
        patch.id,
        `Document "${patch.id}" has revision "${existing._rev}", expected "${patch.ifRevisionID}"`
      );
    }

    const next = structuredClone(existing) as Record<string, unknown>;
    applyPatch(next, patch);
    staged.set(patch.id, { ...(next as FakeDocument), ...this.stamp() });
    return ["update", patch.id];
  }

  private checkReferences(
    staged: Map<string, FakeDocument>,
    changed: Set<string>,
    deleted: Set<string>
  ) {
    for (const id of changed) {
      for (const ref of strongReferences(staged.get(id))) {
        if (!staged.has(ref)) {
          throw new FakeClientError(
            409,
            "documentReferenceMissingError",
            id,
            `Document "${id}" references missing "${ref}"`
          );
        }
      }
    }
    if (deleted.size === 0) return;
    for (const document of staged.values()) {
      const blocked = strongReferences(document).find((ref) =>
        deleted.has(ref)
      );
      if (blocked) {
        throw new FakeClientError(
          409,
          "documentHasExistingReferencesError",
          blocked,
          `Document "${blocked}" cannot be deleted: "${document._id}" references it`
        );
      }
    }
  }
}

/** setIfMissing, set, unset, inc, dec: top-level keys or dotted paths into objects. */
function applyPatch(document: Record<string, unknown>, patch: Patch) {
  for (const [path, value] of Object.entries(patch.setIfMissing ?? {})) {
    const { parent, key } = parentOf(document, path, true)!;
    if (parent[key] === undefined) parent[key] = structuredClone(value);
  }
  for (const [path, value] of Object.entries(patch.set ?? {})) {
    const { parent, key } = parentOf(document, path, true)!;
    parent[key] = structuredClone(value);
  }
  for (const path of patch.unset ?? []) {
    const target = parentOf(document, path, false);
    if (target) delete target.parent[target.key];
  }

  // Counters must exist first (setIfMissing, or a document created with 0),
  // so code that forgets to create one fails here instead of in production.
  const add = (amounts: Record<string, number>, sign: 1 | -1) => {
    for (const [path, amount] of Object.entries(amounts)) {
      const target = parentOf(document, path, false);
      const current = target?.parent[target.key];
      if (!target || typeof current !== "number") {
        throw new FakeClientError(
          400,
          "invalidPatchError",
          patch.id,
          `Cannot ${sign > 0 ? "inc" : "dec"} "${path}" of "${patch.id}": not a number`
        );
      }
      target.parent[target.key] = current + sign * amount;
    }
  };
  add(patch.inc ?? {}, 1);
  add(patch.dec ?? {}, -1);
}
