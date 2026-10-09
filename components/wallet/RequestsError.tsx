import { fetchRequests } from "../../slices/walletUiSlice";
import { useAppDispatch } from "../../store";
import { Button } from "../common/Button";

/** Requests couldn't be read: say so where they would be, with Retry. */
export default function RequestsError() {
  const dispatch = useAppDispatch();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-4 text-[15px]"
    >
      <p className="min-w-0 flex-1">
        Payment requests can’t be loaded right now.
      </p>
      <Button variant="outline" onClick={() => void dispatch(fetchRequests())}>
        Retry
      </Button>
    </div>
  );
}
