import { useState } from "react";

import { formatCredits } from "../../lib/superapp/money";
import { showToast } from "../../slices/uiSlice";
import { requestCredits } from "../../slices/walletUiSlice";
import { useAppDispatch } from "../../store";
import { IPaymentRequest } from "../../types/Wallet";
import Dialog from "../common/Dialog";
import Spinner from "../common/Spinner";
import AmountStep from "./AmountStep";
import DialogProblem from "./DialogProblem";
import DoneStep from "./DoneStep";
import RecipientStep from "./RecipientStep";
import RequestConfirm from "./RequestConfirm";
import { useCreditsDraft } from "./useCreditsDraft";
import { useMoneyAction } from "./useMoneyAction";
import { useWalletDialog } from "./useWalletDialog";

/** Where the viewer's own requests are listed. */
export const OUTGOING_REQUESTS_PATH = "/wallet?tab=requests";

/** From → Amount & note → Review → Done, like Send. */
function RequestFlow({
  args,
  onClose,
}: {
  args: Record<string, string> | null;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const run = useMoneyAction();
  const flow = useCreditsDraft(args);
  const [sent, setSent] = useState<IPaymentRequest | null>(null);
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
        You can’t request credits from yourself.
      </DialogProblem>
    );
  }

  if (flow.step === "to" || !other) {
    return <RecipientStep label="From" onSelect={flow.choose} />;
  }

  if (flow.step === "amount" || !draft) {
    return (
      <AmountStep
        relation="From"
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
      <RequestConfirm
        payer={draft.other}
        amount={draft.amount}
        note={draft.note}
        onConfirm={async () => {
          const request = await run(requestCredits(draft, flow.key));
          setSent(request);
          dispatch(
            showToast({
              message: `Requested ${formatCredits(request.amount)} from ${request.payer.fullname}`,
              action: { label: "View", href: OUTGOING_REQUESTS_PATH },
            })
          );
        }}
        onDone={() => {
          flow.rotate();
          flow.setStep("done");
        }}
        onBack={() => flow.setStep("amount")}
      />
    );
  }

  return (
    <DoneStep
      title="Request sent"
      link={{ href: OUTGOING_REQUESTS_PATH, label: "View your requests" }}
      onDone={onClose}
    >
      You’ll get a notification when {sent.payer.fullname} pays.
    </DoneStep>
  );
}

/** Request credits: a global dialog (ui.dialog "request"), a bottom sheet on phones. */
export default function RequestDialog() {
  const { open, args, close } = useWalletDialog("request");

  return (
    <Dialog open={open} onClose={close} title="Request credits" variant="sheet">
      <RequestFlow key={JSON.stringify(args)} args={args} onClose={close} />
    </Dialog>
  );
}
