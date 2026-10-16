import { useState } from "react";

import { formatCredits } from "../../lib/superapp/money";
import { openDialog, showToast } from "../../slices/uiSlice";
import { sendCredits } from "../../slices/walletUiSlice";
import { useAppDispatch } from "../../store";
import { ITransfer } from "../../types/Wallet";
import Dialog from "../common/Dialog";
import Spinner from "../common/Spinner";
import PaymentConfirm from "../superapp/PaymentConfirm";
import AmountStep from "./AmountStep";
import DialogProblem from "./DialogProblem";
import { receiptPath } from "./dialogArgs";
import DoneStep from "./DoneStep";
import RecipientStep from "./RecipientStep";
import { useCreditsDraft } from "./useCreditsDraft";
import { useMoneyAction } from "./useMoneyAction";
import { useWalletDialog } from "./useWalletDialog";

/** To → Amount & note → Review → Done. Mounted while the dialog is open. */
function SendFlow({
  args,
  onClose,
}: {
  args: Record<string, string> | null;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const run = useMoneyAction();
  const flow = useCreditsDraft(args);
  const [sent, setSent] = useState<ITransfer | null>(null);
  const { other, draft } = flow;

  if (flow.lookup.status === "loading") {
    return <Spinner label="Loading" />;
  }
  if (flow.lookup.status === "failed") {
    return (
      <DialogProblem onClose={onClose}>{flow.lookup.message}</DialogProblem>
    );
  }
  if (flow.isSelf) {
    return (
      <DialogProblem onClose={onClose}>
        You can’t send credits to yourself.
      </DialogProblem>
    );
  }

  if (flow.step === "to" || !other) {
    return <RecipientStep label="To" onSelect={flow.choose} />;
  }

  if (flow.step === "amount" || !draft) {
    return (
      <AmountStep
        relation="To"
        other={other}
        amount={flow.amount}
        onAmountChange={(text) => flow.setAmount(text)}
        note={flow.note}
        onNoteChange={flow.setNote}
        min={flow.min}
        max={flow.max}
        onNext={() => flow.setStep("review")}
        onBack={flow.locked ? undefined : () => flow.setStep("to")}
      />
    );
  }

  if (flow.step === "review" || !sent) {
    return (
      <PaymentConfirm
        action="Send"
        payee={draft.other}
        amount={draft.amount}
        note={draft.note}
        // The dialog's key, which survives Back (see useCreditsDraft).
        onConfirm={async () => {
          const transfer = await run(sendCredits(draft, flow.key));
          setSent(transfer);
          dispatch(
            showToast({
              message: `Sent ${formatCredits(transfer.amount)} to ${transfer.to.fullname}`,
              action: { label: "Receipt", href: receiptPath(transfer.id) },
            })
          );
        }}
        onDone={() => {
          flow.rotate();
          flow.setStep("done");
        }}
        onBack={() => flow.setStep("amount")}
        onAddCredits={() => dispatch(openDialog("topUp"))}
      />
    );
  }

  return (
    <DoneStep
      title="Sent"
      link={{ href: receiptPath(sent.id), label: "View receipt" }}
      onDone={onClose}
    >
      You sent {formatCredits(sent.amount)} to {sent.to.fullname}.
    </DoneStep>
  );
}

/** Send credits: a global dialog (ui.dialog "send"), a bottom sheet on phones. */
export default function SendDialog() {
  const { open, args, close } = useWalletDialog("send");

  return (
    <Dialog open={open} onClose={close} title="Send credits" variant="sheet">
      <SendFlow key={JSON.stringify(args)} args={args} onClose={close} />
    </Dialog>
  );
}
