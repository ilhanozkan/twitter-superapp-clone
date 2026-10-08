import { evaluate, parse } from "groq-js";

import { SanityClientLike } from "../lib/db/sanity/repository";
import { SanitySeedDocument } from "../lib/db/sanity/seed";

type Document = SanitySeedDocument & { _updatedAt?: string; _rev?: string };

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

/**
 * An in-memory stand-in for `@sanity/client` that runs real GROQ through
 * groq-js and enforces Sanity's rule that strongly referenced documents
 * cannot be deleted. Used by tests; never by the app.
 */
export class FakeSanityClient implements SanityClientLike {
  documents: Document[];
  private counter = 0;

  constructor(
    documents: SanitySeedDocument[],
    private readonly now: () => Date = () => new Date()
  ) {
    this.documents = documents.map((document) => ({ ...document }));
  }

  async fetch<T>(
    query: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const tree = parse(query, { params });
    const result = await evaluate(tree, { dataset: this.documents, params });
    return (await result.get()) as T;
  }

  async create(document: { _type: string; [field: string]: unknown }) {
    this.counter += 1;
    const timestamp = this.now().toISOString();
    const created: Document = {
      ...document,
      _id: `fake-${this.counter}`,
      _createdAt: timestamp,
      _updatedAt: timestamp,
      _rev: `rev-${this.counter}`,
    };
    this.assertReferencesExist(created);
    this.documents.push(created);
    return created;
  }

  async createIfNotExists(document: {
    _id: string;
    _type: string;
    [field: string]: unknown;
  }) {
    const existing = this.documents.find(
      (candidate) => candidate._id === document._id
    );
    if (existing) return existing;

    const timestamp = this.now().toISOString();
    const created: Document = {
      ...document,
      _createdAt: timestamp,
      _updatedAt: timestamp,
    };
    this.assertReferencesExist(created);
    this.documents.push(created);
    return created;
  }

  async delete(id: string) {
    await this.mutate([{ delete: { id } }]);
    return { results: [] };
  }

  async mutate(mutations: { delete: { id: string } }[]) {
    const ids = new Set(mutations.map((mutation) => mutation.delete.id));
    const remaining = this.documents.filter(
      (document) => !ids.has(document._id)
    );

    for (const document of remaining) {
      const blocked = strongReferences(document).find((ref) => ids.has(ref));
      if (blocked) {
        throw new Error(
          `Document "${blocked}" cannot be deleted: "${document._id}" references it`
        );
      }
    }

    this.documents = remaining;
    return { results: [] };
  }

  private assertReferencesExist(document: Document) {
    for (const ref of strongReferences(document)) {
      if (!this.documents.some((candidate) => candidate._id === ref)) {
        throw new Error(
          `Document "${document._id}" references missing "${ref}"`
        );
      }
    }
  }
}
