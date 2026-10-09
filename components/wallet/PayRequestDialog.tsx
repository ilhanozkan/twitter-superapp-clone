import { formatCredits } from "../../lib/superapp/money";
import { openDialog, showToast } from "../../slices/uiSlice";
import { payRequest } from "../../slices/walletUiSlice";
import { useAppDispatch } from "../../store";
import { IPaymentRequest } from "../../types/Wallet";
import Dialog from "../common/Dialog";
import PaymentConfirm from "../superapp/PaymentConfirm";
import { receiptPath } from "./dialogArgs";
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
  /** `paid` is true after a success. */
  onClose: (paid: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const run = useMoneyAction();

  return (
    <Dialog
      open={!!request}
      onClose={() => onClose(false)}
      title="Pay request"
      variant="sheet"
    >
      {request && (
        <PaymentConfirm
          action="Pay"
          payee={request.requester}
          amount={request.amount}
          note={request.note}
          onConfirm={async (key) => {
            const { transfer } = await run(payRequest(request, key));
            dispatch(
              showToast({
                message: `You paid ${request.requester.fullname} ${formatCredits(transfer.amount)}`,
                action: { label: "Receipt", href: receiptPath(transfer.id) },
              })
            );
          }}
          onDone={() => onClose(true)}
          onAddCredits={() => dispatch(openDialog("topUp"))}
        />
      )}
    </Dialog>
  );
}
