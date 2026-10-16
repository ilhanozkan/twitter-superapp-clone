import { describe, expect, it } from "vitest";

import { keyOf } from "../lib/db/sanity/ids";
import { SanitySeedDocument, seedExportDocuments } from "../lib/db/sanity/seed";
import { FakeSanityClient } from "./fakeSanityClient";

// Everything `npm run seed:sanity` exports, validated against the Studio's
// schemas (sanity/schemaTypes) as the Studio would validate each document:
// its type exists, every field is declared, values have the declared type,
// list and reference targets, and every validation rule passes (required
// fields, ranges, patterns and the schemas' own custom checks, which query
// the exported dataset). A document that fails here would show errors in
// the Studio after `sanity dataset import`.

const NOW = new Date("2026-10-08T12:00:00.000Z");

type ListOption = string | { value: string };

interface Field {
  name?: string;
  type: string;
  fields?: Field[];
  of?: Field[];
  to?: { type: string }[];
  weak?: boolean;
  options?: { list?: ListOption[] };
  validation?: (rule: FakeRule) => unknown;
}

interface SchemaType extends Field {
  name: string;
}

interface ValidationContext {
  document: SanitySeedDocument;
  parent: unknown;
  path: string[];
  getClient(options: { apiVersion: string }): {
    fetch<T>(query: string, params?: Record<string, unknown>): Promise<T>;
  };
}

type Check =
  | { kind: "required" | "integer" | "unique" }
  | { kind: "min" | "max"; limit: number }
  | { kind: "regex"; pattern: RegExp; invert: boolean }
  | { kind: "uri"; allowRelative: boolean; schemes: string[] }
  | {
      kind: "custom";
      check: (value: unknown, context: ValidationContext) => unknown;
    };

/**
 * Records a field's rules like Sanity's Rule builder: every call returns a
 * new rule. A schema that starts using a method this lacks fails with
 * "rule.<method> is not a function", so add it here.
 */
class FakeRule {
  constructor(
    readonly checks: readonly Check[] = [],
    readonly level: "error" | "warning" = "error"
  ) {}

  private with(check: Check) {
    return new FakeRule([...this.checks, check], this.level);
  }
  required() {
    return this.with({ kind: "required" });
  }
  integer() {
    return this.with({ kind: "integer" });
  }
  unique() {
    return this.with({ kind: "unique" });
  }
  min(limit: number) {
    return this.with({ kind: "min", limit });
  }
  max(limit: number) {
    return this.with({ kind: "max", limit });
  }
  regex(pattern: RegExp, options: { invert?: boolean } = {}) {
    return this.with({ kind: "regex", pattern, invert: !!options.invert });
  }
  uri(options: { allowRelative?: boolean; scheme?: string[] } = {}) {
    return this.with({
      kind: "uri",
      allowRelative: !!options.allowRelative,
      schemes: options.scheme ?? ["http", "https"],
    });
  }
  custom(check: (value: never, context: ValidationContext) => unknown) {
    return this.with({
      kind: "custom",
      check: check as (value: unknown, context: ValidationContext) => unknown,
    });
  }
  warning() {
    return new FakeRule(this.checks, "warning");
  }
  error() {
    return new FakeRule(this.checks, "error");
  }
}

/**
 * The Studio's schema types, loaded when the test runs: a static import
 * would make the type checker follow the schema files into `sanity`'s
 * types, which the app doesn't install.
 */
async function loadSchemaTypes(): Promise<Map<string, SchemaType>> {
  const index = "../sanity/schemaTypes/index";
  const { schemaTypes } = (await import(/* @vite-ignore */ index)) as {
    schemaTypes: SchemaType[];
  };
  return new Map(schemaTypes.map((type) => [type.name, type]));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const STRING_TYPES = new Set(["string", "text", "url", "datetime"]);
const SYSTEM_FIELDS = new Set([
  "_id",
  "_type",
  "_createdAt",
  "_updatedAt",
  "_rev",
]);

const listValues = (list: ListOption[]) =>
  list.map((option) => (typeof option === "string" ? option : option.value));

/** What the Studio's rules measure: a number, a string's length, an array's. */
const measure = (value: unknown) =>
  typeof value === "number"
    ? value
    : typeof value === "string" || Array.isArray(value)
      ? value.length
      : NaN;

async function ruleProblems(
  rule: FakeRule,
  value: unknown,
  context: ValidationContext
): Promise<string[]> {
  const problems: string[] = [];
  const missing =
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);
  for (const check of rule.checks) {
    if (check.kind === "required") {
      if (missing) problems.push("Required");
      continue;
    }
    if (check.kind === "custom") {
      const result = await check.check(value, context);
      if (result !== true && result !== undefined) {
        problems.push(
          typeof result === "string" ? result : JSON.stringify(result)
        );
      }
      continue;
    }
    // Sanity's built-in checks pass an empty value; `required` catches it.
    if (missing) continue;
    switch (check.kind) {
      case "integer":
        if (!Number.isInteger(value)) problems.push("Must be an integer");
        break;
      case "min":
        if (!(measure(value) >= check.limit)) {
          problems.push(`Must be at least ${check.limit}`);
        }
        break;
      case "max":
        if (!(measure(value) <= check.limit)) {
          problems.push(`Must be at most ${check.limit}`);
        }
        break;
      case "regex":
        check.pattern.lastIndex = 0;
        if (
          typeof value !== "string" ||
          check.pattern.test(value) === check.invert
        ) {
          problems.push(`Doesn't match ${check.pattern}`);
        }
        break;
      case "uri": {
        const text = String(value);
        const relative = text.startsWith("/") && !text.startsWith("//");
        let scheme: string | null = null;
        try {
          scheme = new URL(text).protocol.replace(/:$/, "");
        } catch {
          scheme = null;
        }
        const ok =
          (relative && check.allowRelative) ||
          (scheme !== null && check.schemes.includes(scheme));
        if (!ok) problems.push(`Not a valid URL: ${text}`);
        break;
      }
      case "unique": {
        const items = (value as unknown[]).map((item) => JSON.stringify(item));
        if (new Set(items).size !== items.length) {
          problems.push("Can't contain duplicates");
        }
        break;
      }
    }
  }
  return rule.level === "warning"
    ? problems.map((problem) => `warning: ${problem}`)
    : problems;
}

interface Validation {
  types: Map<string, SchemaType>;
  /** Every exported document by id, for references and custom checks. */
  ids: Map<string, SanitySeedDocument>;
  client: FakeSanityClient;
}

/** The array member an item belongs to, chosen the way the Studio does. */
function memberOf(field: Field, item: unknown): Field | undefined {
  const members = field.of ?? [];
  if (isRecord(item)) {
    const typeName = typeof item._type === "string" ? item._type : "object";
    return typeName === "object" && members.length === 1
      ? members[0]
      : members.find((member) => member.name === typeName);
  }
  const jsonType = typeof item;
  return members.find((member) =>
    STRING_TYPES.has(member.type)
      ? jsonType === "string"
      : member.type === jsonType
  );
}

async function fieldProblems(
  field: Field,
  value: unknown,
  path: string[],
  parent: unknown,
  document: SanitySeedDocument,
  validation: Validation
): Promise<string[]> {
  const at = path.join(".");
  const problems: string[] = [];
  const named = validation.types.get(field.type);
  const shape: Field = named && named.type === "object" ? named : field;
  const jsonType =
    shape.type === "object" || shape.fields
      ? "object"
      : STRING_TYPES.has(shape.type)
        ? "string"
        : shape.type;

  if (value !== undefined) {
    switch (jsonType) {
      case "string":
        if (typeof value !== "string") {
          problems.push(`${at}: expected a string`);
        } else if (
          shape.options?.list &&
          !listValues(shape.options.list).includes(value)
        ) {
          problems.push(`${at}: "${value}" isn't one of the options`);
        } else if (
          shape.type === "datetime" &&
          !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(value)
        ) {
          problems.push(`${at}: "${value}" isn't an ISO date-time`);
        }
        break;
      case "number":
      case "boolean":
        if (typeof value !== jsonType) {
          problems.push(`${at}: expected a ${jsonType}`);
        }
        break;
      case "object":
        if (!isRecord(value)) {
          problems.push(`${at}: expected an object`);
        } else {
          problems.push(
            ...(await objectProblems(
              shape.fields ?? [],
              value,
              path,
              document,
              validation
            ))
          );
        }
        break;
      case "array":
        if (!Array.isArray(value)) {
          problems.push(`${at}: expected an array`);
          break;
        }
        for (const [index, item] of value.entries()) {
          const member = memberOf(shape, item);
          const itemPath = [...path, String(index)];
          if (!member) {
            problems.push(`${itemPath.join(".")}: not a type this list takes`);
            continue;
          }
          if (isRecord(item) && typeof item._key !== "string") {
            problems.push(`${itemPath.join(".")}: missing _key`);
          }
          problems.push(
            ...(await fieldProblems(
              member,
              item,
              itemPath,
              value,
              document,
              validation
            ))
          );
        }
        if (
          value.some(isRecord) &&
          new Set(value.map((item) => (item as { _key?: string })._key))
            .size !== value.length
        ) {
          problems.push(`${at}: repeated _key`);
        }
        break;
      case "reference": {
        if (
          !isRecord(value) ||
          value._type !== "reference" ||
          typeof value._ref !== "string"
        ) {
          problems.push(`${at}: expected a reference`);
          break;
        }
        if (!!value._weak !== !!shape.weak) {
          problems.push(
            `${at}: ${shape.weak ? "must" : "mustn't"} be a weak reference`
          );
        }
        const target = validation.ids.get(value._ref);
        const targets = (shape.to ?? []).map((to) => to.type);
        if (!target) {
          problems.push(`${at}: references missing document ${value._ref}`);
        } else if (!targets.includes(target._type)) {
          problems.push(`${at}: can't reference a ${target._type}`);
        }
        break;
      }
      default:
        problems.push(`${at}: unsupported field type "${shape.type}"`);
    }
  }

  const context: ValidationContext = {
    document,
    parent,
    path,
    getClient: () => validation.client,
  };
  const rules = [field.validation?.(new FakeRule()) ?? []].flat(Infinity);
  for (const rule of rules) {
    if (!(rule instanceof FakeRule)) {
      problems.push(`${at}: validation returned ${String(rule)}`);
      continue;
    }
    for (const problem of await ruleProblems(rule, value, context)) {
      problems.push(`${at}: ${problem}`);
    }
  }
  return problems;
}

async function objectProblems(
  fields: Field[],
  value: Record<string, unknown>,
  path: string[],
  document: SanitySeedDocument,
  validation: Validation
): Promise<string[]> {
  const declared = new Set(fields.map((field) => field.name));
  const allowed = path.length === 0 ? SYSTEM_FIELDS : new Set(["_key"]);
  const problems = Object.keys(value)
    .filter((key) => !declared.has(key) && !allowed.has(key))
    .map((key) => `${[...path, key].join(".")}: not in the schema`);
  for (const field of fields) {
    problems.push(
      ...(await fieldProblems(
        field,
        value[field.name!],
        [...path, field.name!],
        value,
        document,
        validation
      ))
    );
  }
  return problems;
}

/** Everything the Studio would flag on `document`, as "path: problem". */
async function documentProblems(
  document: SanitySeedDocument,
  validation: Validation
): Promise<string[]> {
  const type = validation.types.get(document._type);
  if (type?.type !== "document") return [`no document type ${document._type}`];
  return objectProblems(type.fields ?? [], document, [], document, validation);
}

async function validationFor(
  documents: SanitySeedDocument[]
): Promise<Validation> {
  return {
    types: await loadSchemaTypes(),
    ids: new Map(documents.map((document) => [document._id, document])),
    client: new FakeSanityClient(documents, () => NOW),
  };
}

async function exportProblems(
  documents: SanitySeedDocument[]
): Promise<string[]> {
  const validation = await validationFor(documents);
  const problems: string[] = [];
  for (const document of documents) {
    for (const problem of await documentProblems(document, validation)) {
      problems.push(`${document._id} ${problem}`);
    }
  }
  return problems;
}

/** A value at a dotted path ("context.id"), or undefined. */
const valueAt = (document: Record<string, unknown>, path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (value, key) => (isRecord(value) ? value[key] : undefined),
      document
    );

// Records the app links by key rather than by Sanity reference:
// [type, field, the types the key may name].
const KEY_LINKS: [string, string, string[]][] = [
  ["tweet", "attachment.productId", ["product"]],
  ["transfer", "reversedBy", ["transfer"]],
  ["transfer", "reverses", ["transfer"]],
  ["paymentRequest", "transferId", ["transfer"]],
  ["paymentRequest", "conversationId", ["conversation"]],
  ["order", "paymentTransferId", ["transfer"]],
  ["order", "refundTransferId", ["transfer"]],
  ["order", "sourceTweetId", ["tweet"]],
  ["ride", "paymentTransferId", ["transfer"]],
  ["ride", "refundTransferId", ["transfer"]],
  ["driverLock", "rideId", ["ride"]],
  ["storyView", "storyId", ["story"]],
  ["conversationMember", "conversationId", ["conversation"]],
  ["message", "conversationId", ["conversation"]],
  ["message", "transferId", ["transfer"]],
  ["message", "requestId", ["paymentRequest"]],
  ["message", "tweetId", ["tweet"]],
  ["message", "storyId", ["story"]],
];

const CONTEXT_TYPES: Record<string, string> = {
  tweet: "tweet",
  conversation: "conversation",
  request: "paymentRequest",
  order: "order",
  ride: "ride",
};

describe("the seed:sanity export against the Studio schemas", () => {
  const documents = seedExportDocuments(NOW);

  it("has a Studio document type for every document", async () => {
    const types = await loadSchemaTypes();
    const missing = [
      ...new Set(documents.map((document) => document._type)),
    ].filter((type) => types.get(type)?.type !== "document");
    expect(missing).toEqual([]);
  });

  it("gives every document its required fields, valid, and no others", async () => {
    expect(await exportProblems(documents)).toEqual([]);
  });

  it("points every reference at a document in the export", async () => {
    // Sanity references: checked against their schema field above; here
    // every one, wherever it is, must name an exported document.
    const ids = new Set(documents.map((document) => document._id));
    const references: string[] = [];
    const collect = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (isRecord(value)) {
        if (value._type === "reference") references.push(String(value._ref));
        else Object.values(value).forEach(collect);
      }
    };
    documents.forEach(collect);
    expect(references.length).toBeGreaterThan(0);
    expect(references.filter((ref) => !ids.has(ref))).toEqual([]);
  });

  it("points every key the app links by at an exported record of the right type", () => {
    const byKey = new Map(
      documents.map((document) => [keyOf(document._id), document])
    );
    const dangling: string[] = [];
    const checked = new Set<string>();
    const expectRecord = (
      document: SanitySeedDocument,
      field: string,
      key: unknown,
      types: string[]
    ) => {
      if (key === undefined) return;
      checked.add(`${document._type}.${field}`);
      const target = byKey.get(String(key));
      if (!target || !types.includes(target._type)) {
        dangling.push(`${document._id} ${field} → ${String(key)}`);
      }
    };
    for (const document of documents) {
      for (const [type, field, types] of KEY_LINKS) {
        if (document._type === type) {
          expectRecord(document, field, valueAt(document, field), types);
        }
      }
      if (document._type === "transfer" && isRecord(document.context)) {
        expectRecord(document, "context.id", document.context.id, [
          CONTEXT_TYPES[String(document.context.type)],
        ]);
      }
      if (document._type === "order" && Array.isArray(document.lines)) {
        for (const line of document.lines as { productId: string }[]) {
          expectRecord(document, "lines.productId", line.productId, [
            "product",
          ]);
        }
      }
      for (const [field, value] of Object.entries(document)) {
        // Every lower-case username companion (a wallet's `key`, a
        // transfer's `toKey`...) names an account.
        if (/^(key|\w+Key)$/.test(field)) {
          expectRecord(document, "*Key", `user-${String(value)}`, ["user"]);
        }
      }
    }
    expect(dangling).toEqual([]);
    // The seeds link records of every lane, so none of these went unchecked.
    expect([...checked]).toEqual(
      expect.arrayContaining([
        "tweet.attachment.productId",
        "transfer.context.id",
        "paymentRequest.transferId",
        "paymentRequest.conversationId",
        "order.paymentTransferId",
        "order.lines.productId",
        "ride.paymentTransferId",
        "driverLock.rideId",
        "storyView.storyId",
        "conversationMember.conversationId",
        "message.conversationId",
        "message.transferId",
        "message.requestId",
        "wallet.*Key",
        "transfer.*Key",
        "order.*Key",
        "ride.*Key",
        "story.*Key",
        "message.*Key",
      ])
    );
  });

  it("catches what the Studio would flag", async () => {
    // The checks above pass on the export; each of these breaks one rule.
    const find = (id: string) => {
      const document = documents.find((candidate) => candidate._id === id);
      if (!document) throw new Error(`No document ${id}`);
      return structuredClone(document);
    };
    const like = documents.find((document) => document._type === "like")!;
    const broken: [SanitySeedDocument, RegExp][] = [
      [
        { ...find("user-sarahcodes"), fullname: undefined },
        /fullname: Required/,
      ],
      [{ ...find("seed-t22"), mood: "happy" }, /mood: not in the schema/],
      [{ ...find("seed-p-kk-latte"), price: 4.5 }, /price: Must be an integer/],
      [{ ...find("seed-p-kk-latte"), price: 5 }, /price: Must be at least 10/],
      [
        { ...find("businessProfile-kizilaykahve"), placeId: "moon" },
        /placeId: "moon" isn't one of the options/,
      ],
      [
        { ...find("businessProfile-kizilaykahve"), opens: "25:00" },
        /opens: Doesn't match/,
      ],
      [
        { ...find("businessProfile-kizilaykahve"), timeZone: "Mars/Base" },
        /timeZone: Unknown time zone/,
      ],
      [
        { ...find("private.seed-o01"), lines: [{ productId: "x" }] },
        /lines\.0: missing _key/,
      ],
      [
        { ...find("private.seed-tx01"), createdAt: "yesterday" },
        /createdAt: "yesterday" isn't an ISO date-time/,
      ],
      [
        {
          ...like,
          tweet: { _type: "reference", _ref: "seed-t404", _weak: true },
        },
        /tweet: references missing document seed-t404/,
      ],
      [
        { ...like, tweet: { _type: "reference", _ref: "seed-t01" } },
        /tweet: must be a weak reference/,
      ],
      [
        { ...find("user-superapp"), _id: "user-superapp-2" },
        /username: This username is already taken/,
      ],
    ];
    const validation = await validationFor(documents);
    for (const [document, problem] of broken) {
      expect(
        (await documentProblems(document, validation)).join("\n"),
        document._id
      ).toMatch(problem);
    }
    // A draft of a document is the same document, not a clash.
    expect(
      await documentProblems(
        { ...find("user-superapp"), _id: "drafts.user-superapp" },
        validation
      )
    ).toEqual([]);
    expect(
      await documentProblems(
        { _id: "x", _type: "unknown", _createdAt: NOW.toISOString() },
        validation
      )
    ).toEqual(["no document type unknown"]);
  });
});
