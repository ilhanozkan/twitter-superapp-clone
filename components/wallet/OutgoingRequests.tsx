import { useRef } from "react";

import { openDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { Button } from "../common/Button";
import Spinner from "../common/Spinner";
import RequestCard from "./RequestCard";
import RequestsError, { useFocusAfterRetry } from "./RequestsError";

/** The Requests tab: the viewer's own requests, newest first, with Cancel while pending. */
export default function OutgoingRequests() {
  const dispatch = useAppDispatch();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const { outgoing, status } = useAppSelector(
    (state) => state.walletUi.requests
  );
  // Back from Retry: the first request's summary, or "No requests".
  const list = useRef<HTMLUListElement>(null);
  const empty = useRef<HTMLParagraphElement>(null);
  const focusAfterRetry = useFocusAfterRetry(
    () =>
      list.current?.querySelector<HTMLElement>("[data-request-summary]") ??
      empty.current
  );

  if (status === "failed" || status === "retrying") {
    return <RequestsError onRetry={focusAfterRetry} />;
  }
  if (status !== "loaded") return <Spinner label="Loading your requests" />;

  if (outgoing.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 px-4 py-8 text-[15px]">
        <p ref={empty} tabIndex={-1}>
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
    <ul ref={list}>
      {outgoing.map((request) => (
        <li key={request.id}>
          <RequestCard request={request} direction="outgoing" />
        </li>
      ))}
    </ul>
  );
}
