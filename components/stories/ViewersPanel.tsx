import { useCallback, useEffect, useId, useRef, useState } from "react";
import { HiXMark } from "react-icons/hi2";

import { errorMessage } from "../../lib/client/api";
import { storiesApi } from "../../lib/client/storiesApi";
import { IAuthor } from "../../types/User";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import Spinner from "../common/Spinner";

type ViewersState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: IAuthor[] };

/**
 * Who watched one of your stories, most recent first (only the author can
 * load it). It opens over the story inside the viewer, which stays paused
 * meanwhile; focus moves to its heading and Close (or Esc, handled by the
 * viewer) returns it to "Seen by".
 */
export default function ViewersPanel({
  storyId,
  onClose,
}: {
  storyId: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<ViewersState>({ status: "loading" });
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  const fetchViewers = useCallback(() => {
    storiesApi.viewers(storyId).then(
      ({ items }) => setState({ status: "ready", items }),
      (error: unknown) =>
        setState({ status: "error", message: errorMessage(error) })
    );
  }, [storyId]);

  const retry = () => {
    setState({ status: "loading" });
    fetchViewers();
  };

  useEffect(() => {
    heading.current?.focus();
  }, []);

  useEffect(() => {
    fetchViewers();
  }, [fetchViewers]);

  return (
    <section
      aria-labelledby={headingId}
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[75%] flex-col rounded-t-2xl bg-surface text-fg shadow-menu"
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <h3
          ref={heading}
          id={headingId}
          tabIndex={-1}
          className="flex-1 text-[17px] font-bold focus:outline-none"
        >
          Viewers
        </h3>
        <button
          type="button"
          aria-label="Close viewers"
          onClick={onClose}
          className="-mr-2 rounded-full p-2 text-xl transition-colors hover:bg-fg/10"
        >
          <HiXMark aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {state.status === "loading" && <Spinner label="Loading viewers" />}
        {state.status === "error" && (
          <div className="flex flex-col items-start gap-3 p-4">
            <p role="alert" className="text-[15px] text-danger">
              {state.message}
            </p>
            <Button variant="outline" size="sm" onClick={retry}>
              Retry
            </Button>
          </div>
        )}
        {state.status === "ready" && state.items.length === 0 && (
          <p className="p-4 text-[15px] text-muted">
            No one has seen this story yet.
          </p>
        )}
        {state.status === "ready" && state.items.length > 0 && (
          <ul aria-labelledby={headingId} className="py-1">
            {state.items.map((viewer) => (
              <li
                key={viewer.username}
                className="flex items-center gap-3 px-4 py-2"
              >
                <Avatar user={viewer} size={36} />
                <span className="min-w-0 leading-5">
                  <span className="block truncate font-bold">
                    {viewer.fullname}
                  </span>
                  <span className="block truncate text-[15px] text-muted">
                    @{viewer.username}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
