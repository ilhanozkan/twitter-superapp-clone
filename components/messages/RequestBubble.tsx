import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RiHandCoinLine } from "react-icons/ri";

import { errorMessage } from "../../lib/client/api";
import { formatAmount, formatCredits } from "../../lib/superapp/money";
import { answerChatRequest, payChatRequest } from "../../slices/messagesSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IPaymentRequest, PaymentRequestStatus } from "../../types/Wallet";
import { Button } from "../common/Button";
import Dialog from "../common/Dialog";
import PaymentConfirm from "../superapp/PaymentConfirm";
import { describeRequest, isMine, REQUEST_STATUS_LABELS } from "./messageText";

/** Money controls are at least 44px tall on phones (§17); small elsewhere. */
const PHONE_TARGET = "max-xs:min-h-11";

const receiptPath = (transferId: string) =>
  `/wallet/transactions/${encodeURIComponent(transferId)}`;

function StatusChip({ status }: { status: PaymentRequestStatus }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 text-[12px] font-bold leading-5 ${
        status === "paid"
          ? "border-success text-success"
          : "border-line text-muted"
      }`}
    >
      {REQUEST_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * A payment request in the chat, as the request record is now (paid,
 * declined... show to both members on their next poll). The payer gets
 * Pay (reviewed in PaymentConfirm) and Decline; the requester gets Cancel
 * while it is pending.
 */
export default function RequestBubble({
  request,
  viewer,
}: {
  request: IPaymentRequest;
  viewer: string;
}) {
  const dispatch = useAppDispatch();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const walletOn = useAppSelector((state) => state.session.features.wallet);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState<"decline" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const paid = useRef<string | null>(null);
  const settleAfterSheet = useRef(false);

  const requester = isMine(request.requester, viewer);
  const canAnswer = walletOn && !readOnly && request.status === "pending";
  const amount = formatAmount(request.amount);

  // The buttons go away once answered: keep focus on the bubble.
  const settle = () => bubble.current?.focus();

  // After paying, only once the sheet has closed: until then the modal
  // makes the bubble inert, and closing it tries to return focus to Pay,
  // which is gone by then. The Dialog's own effect (a child's) runs first.
  useEffect(() => {
    if (paying || !settleAfterSheet.current) return;
    settleAfterSheet.current = false;
    bubble.current?.focus();
  }, [paying]);

  const answer = async (kind: "decline" | "cancel") => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      await dispatch(answerChatRequest(request.id, kind));
      settle();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      ref={bubble}
      tabIndex={-1}
      className="w-72 max-w-full rounded-2xl border border-line bg-surface p-3 text-[15px] outline-offset-2"
    >
      <p className="flex items-start gap-2 font-bold leading-5">
        <RiHandCoinLine
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-lg text-tip"
        />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {describeRequest(request, viewer)}
          {request.note && (
            <span className="font-normal"> · {request.note}</span>
          )}
        </span>
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-2">
        <StatusChip status={request.status} />
        {request.status === "paid" && request.transferId && walletOn && (
          <Link
            href={receiptPath(request.transferId)}
            className="text-[13px] font-bold text-primary underline underline-offset-2"
          >
            View receipt
          </Link>
        )}
      </p>

      {canAnswer && (
        <div className="mt-3 flex flex-wrap gap-2">
          {requester ? (
            <Button
              variant="outline"
              size="sm"
              className={PHONE_TARGET}
              aria-busy={busy === "cancel"}
              disabled={busy !== null}
              onClick={() => answer("cancel")}
            >
              {busy === "cancel" ? (
                "Cancelling…"
              ) : (
                <>
                  Cancel<span className="sr-only"> request</span>
                </>
              )}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                className={PHONE_TARGET}
                aria-haspopup="dialog"
                disabled={busy !== null}
                onClick={() => setPaying(true)}
              >
                Pay {amount}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={PHONE_TARGET}
                aria-busy={busy === "decline"}
                disabled={busy !== null}
                onClick={() => answer("decline")}
              >
                {busy === "decline" ? (
                  "Declining…"
                ) : (
                  <>
                    Decline<span className="sr-only"> request</span>
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      <Dialog
        open={paying}
        onClose={() => setPaying(false)}
        title="Pay request"
        variant="sheet"
      >
        <PaymentConfirm
          action="Pay"
          payee={request.requester}
          amount={request.amount}
          note={request.note}
          onConfirm={async (key) => {
            const { transfer } = await dispatch(
              payChatRequest(request.id, key)
            );
            paid.current = transfer.id;
          }}
          onDone={() => {
            settleAfterSheet.current = true;
            setPaying(false);
            dispatch(
              showToast({
                message: `You paid ${request.requester.fullname} ${formatCredits(request.amount)}`,
                ...(paid.current && {
                  action: { label: "Receipt", href: receiptPath(paid.current) },
                }),
              })
            );
          }}
        />
      </Dialog>
    </div>
  );
}
