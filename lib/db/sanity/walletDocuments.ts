import {
  StoredPaymentRequest,
  toPaymentRequestDto,
} from "../../superapp/requests";
import { IAuthor } from "../../../types/User";
import { IPaymentRequest, ITransfer } from "../../../types/Wallet";
import { compact } from "./seeds/documents";
import { keyOf, privateId } from "./ids";

// Wallet records as Sanity documents and back. Private types: the document
// id is "private." + the record's id, and every username has a lower-case
// `*Key` companion for querying. The app and the seed export share these.

const party = (author: IAuthor) =>
  compact({
    username: author.username,
    fullname: author.fullname,
    image: author.image,
  });

/** A transfer as written. Only the primary record of an operation carries `requestHash`. */
export function transferDocument(
  transfer: ITransfer,
  requestHash: string | null = null
) {
  return compact({
    _id: privateId(transfer.id),
    _type: "transfer",
    kind: transfer.kind,
    amount: transfer.amount,
    from: transfer.from ? party(transfer.from) : null,
    fromKey: transfer.from?.username.toLowerCase() ?? null,
    to: party(transfer.to),
    toKey: transfer.to.username.toLowerCase(),
    note: transfer.note,
    context: transfer.context ? compact({ ...transfer.context }) : null,
    holdUntil: transfer.holdUntil,
    reversedBy: transfer.reversedBy,
    reverses: transfer.reverses,
    createdAt: transfer.createdAt,
    requestHash,
  });
}

/** A transfer as TRANSFER_FIELDS reads it. */
export type TransferRow = Omit<ITransfer, "from" | "to"> & {
  from: { username: string; fullname: string; image: string | null } | null;
  to: { username: string; fullname: string; image: string | null };
};

export function transferFromRow(row: TransferRow): ITransfer {
  return {
    id: keyOf(row.id),
    kind: row.kind,
    amount: row.amount,
    from: row.from && { ...row.from, image: row.from.image ?? null },
    to: { ...row.to, image: row.to.image ?? null },
    note: row.note ?? null,
    context: row.context ?? null,
    createdAt: row.createdAt,
    holdUntil: row.holdUntil ?? null,
    reversedBy: row.reversedBy ?? null,
    reverses: row.reverses ?? null,
  };
}

/** A payment request as written (lanes reuse it to create requests in their own transactions). */
export function paymentRequestDocument(record: StoredPaymentRequest) {
  return compact({
    _id: privateId(record.id),
    _type: "paymentRequest",
    requester: party(record.requester),
    requesterKey: record.requester.username.toLowerCase(),
    payer: party(record.payer),
    payerKey: record.payer.username.toLowerCase(),
    amount: record.amount,
    note: record.note,
    status: record.status,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    respondedAt: record.respondedAt,
    transferId: record.transferId,
    conversationId: record.conversationId,
    requestHash: record.requestHash,
  });
}

/** A payment request as REQUEST_FIELDS reads it. */
export type RequestRow = Omit<StoredPaymentRequest, "requestHash">;

/** The API view of a stored request at `now` ("expired" is derived). */
export function toPaymentRequest(doc: RequestRow, now: Date): IPaymentRequest {
  return toPaymentRequestDto(
    {
      ...doc,
      id: keyOf(doc.id),
      requester: { ...doc.requester, image: doc.requester.image ?? null },
      payer: { ...doc.payer, image: doc.payer.image ?? null },
      note: doc.note ?? null,
      respondedAt: doc.respondedAt ?? null,
      transferId: doc.transferId ?? null,
      conversationId: doc.conversationId ?? null,
      requestHash: null,
    },
    now
  );
}
