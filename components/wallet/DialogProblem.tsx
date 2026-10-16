import { ReactNode } from "react";

import { Button } from "../common/Button";

/** Why a money dialog can't go on (an unknown person, yourself), with Close. */
export default function DialogProblem({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="text-[15px]">
        {children}
      </p>
      <Button size="lg" variant="outline" onClick={onClose} data-autofocus>
        Close
      </Button>
    </div>
  );
}
