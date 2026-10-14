import { useEffect, useId, useRef } from "react";

import { fetchRecentPeople } from "../../slices/walletUiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IAuthor } from "../../types/User";
import Avatar from "../common/Avatar";
import RecipientCombobox from "./RecipientCombobox";

/**
 * The first step of Send and Request: search for someone, or pick one of
 * the people the viewer recently exchanged credits with.
 */
export default function RecipientStep({
  label,
  onSelect,
}: {
  /** "To" (send) or "From" (request). */
  label: string;
  onSelect: (person: IAuthor) => void;
}) {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((state) => state.session.viewer?.username);
  const recent = useAppSelector((state) => state.walletUi.recent.people);
  const recentId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void dispatch(fetchRecentPeople());
  }, [dispatch]);

  // A step that replaces another (Back from Amount) takes focus, like the
  // dialog's first one; otherwise focus is left on <body> outside the sheet.
  useEffect(() => {
    root.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  return (
    <div ref={root} className="flex flex-col gap-4">
      <RecipientCombobox
        label={label}
        onSelect={onSelect}
        exclude={viewer ? [viewer] : []}
      />
      {recent.length > 0 && (
        <section aria-labelledby={recentId}>
          <h3 id={recentId} className="text-[15px] font-bold">
            Recent
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {recent.map((person) => (
              <li key={person.username} className="min-w-0 max-w-full">
                <button
                  type="button"
                  onClick={() => onSelect(person)}
                  className="flex min-h-[44px] max-w-full items-center gap-2 rounded-full border border-line py-1 pl-1 pr-4 text-[15px] font-bold transition-colors hover:bg-fg/5"
                >
                  <Avatar user={person} size={32} />
                  <span className="truncate">{person.fullname}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
