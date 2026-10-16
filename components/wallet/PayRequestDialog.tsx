import { useRef } from "react";

import { ApiRequestError, errorMessage } from "../../lib/client/api";
import { formatCredits } from "../../lib/superapp/money";
import { showToast } from "../../slices/uiSlice";
import { findRequest, payRequest } from "../../slices/walletUiSlice";
import { useAppDispatch } from "../../store";
import { IPaymentRequest } from "../../types/Wallet";
import Dialog from "../common/Dialog";
import PaymentConfirm from "../superapp/PaymentConfirm";
import { receiptPath } from "./dialogArgs";
import { useAddCredits } from "./useAddCredits";
import { useAppStore } from "./useAppStore";
import { useMoneyAction } from "./useMoneyAction";

/**
 * Paying a request goes through the same review as every payment (WCAG
 * 3.3.4). There is nothing to edit, so the review's own key serves every
 * retry and is dropped when the sheet closes.
 */
export default function PayRequestDialog({
  request,
  onClose,
}: {
  request: IPaymentRequest | null;
  /** `settled` is true once the request is no longer pending (paid here or elsewhere). */
  onClose: (settled: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const run = useMoneyAction();
  const review = useRef<HTMLDivElement>(null);
  // Back from Add credits: the review's confirm.
  const addCredits = useAddCredits(() =>
    review.current?.querySelector<HTMLElement>("[data-autofocus]")
  );

  /** Answered elsewhere: payRequest re-read it, and it isn't pending anymore. */
  const answeredElsewhere = (error: unknown, id: string) => {
    if (!(error instanceof ApiRequestError)) return false;
    if (error.code !== "invalid_state") return false;
    const fresh = findRequest(store.getState(), id);
    return !!fresh && fresh.status !== "pending";
  };

  return (
    <Dialog
      open={!!request}
      onClose={() => onClose(false)}
      title="Pay request"
      variant="sheet"
    >
      {request && (
        <div ref={review}>
          <PaymentConfirm
            action="Pay"
            payee={request.requester}
            amount={request.amount}
            note={request.note}
            onConfirm={async (key) => {
              try {
                const { transfer } = await run(payRequest(request, key));
                dispatch(
                  showToast({
                    message: `You paid ${request.requester.fullname} ${formatCredits(transfer.amount)}`,
                    action: {
                      label: "Receipt",
                      href: receiptPath(transfer.id),
                    },
                  })
                );
              } catch (error) {
                if (!answeredElsewhere(error, request.id)) throw error;
                // Nothing is left to pay: the sheet is done, the card shows
                // how the request ended, and the toast says so.
                dispatch(showToast({ message: errorMessage(error) }));
              }
            }}
            onDone={() => onClose(true)}
            onAddCredits={addCredits}
          />
        </div>
      )}
    </Dialog>
  );
}
