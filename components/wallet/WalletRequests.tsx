import { useEffect, useId, useRef, useState } from "react";

import { fetchRequests } from "../../slices/walletUiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IPaymentRequest } from "../../types/Wallet";
import PayRequestDialog from "./PayRequestDialog";
import RequestCard from "./RequestCard";
import RequestsError, { useFocusAfterRetry } from "./RequestsError";

/**
 * Slot (§12.3): "Requests for you" on the wallet page, the pending
 * requests others sent the viewer, with Pay (through the review step) and
 * Decline. Hidden when there are none, unless the reader just asked for
 * them with Retry. The wallet page reads them on the server; elsewhere
 * they load on mount.
 */
export default function WalletRequests() {
  const dispatch = useAppDispatch();
  const { incoming, status } = useAppSelector(
    (state) => state.walletUi.requests
  );
  const [paying, setPaying] = useState<IPaymentRequest | null>(null);
  // The request just paid (here or elsewhere): its card takes focus once the
  // sheet has closed (the sheet hands focus back to its Pay button, which is
  // gone by then).
  const paid = useRef<string | null>(null);
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  // After Retry the section shows even when nobody asked, so the heading
  // that takes focus can say so.
  const [retried, setRetried] = useState(false);
  const focusAfterRetry = useFocusAfterRetry(() => heading.current);

  useEffect(() => {
    if (status === "idle") void dispatch(fetchRequests());
  }, [dispatch, status]);

  useEffect(() => {
    if (paying || !paid.current) return;
    document
      .querySelector<HTMLElement>(`[data-request-summary="${paid.current}"]`)
      ?.focus();
    paid.current = null;
  }, [paying]);

  if (status === "failed" || status === "retrying") {
    return (
      <RequestsError
        onRetry={() => {
          focusAfterRetry();
          setRetried(true);
        }}
      />
    );
  }
  if (incoming.length === 0 && !retried) return null;

  return (
    <section aria-labelledby={headingId}>
      <h2
        ref={heading}
        id={headingId}
        tabIndex={-1}
        className="px-4 pt-4 text-xl font-extrabold"
      >
        Requests for you
      </h2>
      {incoming.length === 0 ? (
        <p className="border-b border-line px-4 pb-4 pt-1 text-[15px] text-muted">
          Nobody is waiting for you to pay.
        </p>
      ) : (
        <ul>
          {incoming.map((request) => (
            <li key={request.id}>
              <RequestCard
                request={request}
                direction="incoming"
                onPay={setPaying}
              />
            </li>
          ))}
        </ul>
      )}
      <PayRequestDialog
        request={paying}
        onClose={(settled) => {
          if (settled && paying) paid.current = paying.id;
          setPaying(null);
        }}
      />
    </section>
  );
}
