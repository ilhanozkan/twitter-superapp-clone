import { openDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { Button } from "../common/Button";
import Spinner from "../common/Spinner";
import RequestCard from "./RequestCard";
import RequestsError from "./RequestsError";

/** The Requests tab: the viewer's own requests, newest first, with Cancel while pending. */
export default function OutgoingRequests() {
  const dispatch = useAppDispatch();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const { outgoing, status } = useAppSelector(
    (state) => state.walletUi.requests
  );

  if (status === "failed") return <RequestsError />;
  if (status !== "loaded") return <Spinner label="Loading your requests" />;

  if (outgoing.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 px-4 py-8 text-[15px]">
        <p>
          <span className="block font-bold">No requests</span>
          <span className="text-muted">
            Ask someone for credits and you can follow it here.
          </span>
        </p>
        {!readOnly && (
          <Button
            variant="outline"
            aria-haspopup="dialog"
            onClick={() => dispatch(openDialog("request"))}
          >
            Request credits
          </Button>
        )}
      </div>
    );
  }

  return (
    <ul>
      {outgoing.map((request) => (
        <li key={request.id}>
          <RequestCard request={request} direction="outgoing" />
        </li>
      ))}
    </ul>
  );
}
