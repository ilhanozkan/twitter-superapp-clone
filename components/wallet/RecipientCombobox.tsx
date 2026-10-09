import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { errorMessage } from "../../lib/client/api";
import { walletApi } from "../../lib/client/walletApi";
import { IAuthor } from "../../types/User";
import Avatar from "../common/Avatar";

const SEARCH_DELAY_MS = 200;
const RESULTS = 8;
/** GET /api/users takes 1–50 characters. */
const QUERY_MAX = 50;

type Result =
  { term: string; people: IAuthor[] } | { term: string; error: string };

interface RecipientComboboxProps {
  label: string;
  onSelect: (person: IAuthor) => void;
  /** Usernames never offered, e.g. the viewer's own. */
  exclude?: string[];
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const peopleFound = (count: number) =>
  `${count} ${count === 1 ? "person" : "people"} found`;

/**
 * Picks a person by name or username: an ARIA 1.2 combobox over GET
 * /api/users. Focus stays in the field while the arrow keys move through
 * the suggestions (aria-activedescendant); Enter picks one, Escape closes
 * the list (and then clears the field) without closing the dialog around
 * it. The number of suggestions is announced politely.
 */
export default function RecipientCombobox({
  label,
  onSelect,
  exclude = [],
}: RecipientComboboxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const statusId = `${id}-status`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  // The highlighted suggestion, for the query it was chosen in: a new query
  // starts with none highlighted.
  const [active, setActive] = useState({ term: "", index: -1 });
  const list = useRef<HTMLUListElement>(null);
  const excluded = exclude.join(",");

  const term = query.trim().slice(0, QUERY_MAX);
  const current = term && result?.term === term ? result : null;
  const people = current && "people" in current ? current.people : [];
  const expanded = open && people.length > 0;
  const index = active.term === term ? active.index : -1;
  const optionId = (i: number) => `${id}-option-${i}`;

  useEffect(() => {
    if (!term) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const { items } = await walletApi.searchUsers(term, RESULTS);
        const hidden = excluded ? excluded.split(",") : [];
        const found = items
          .filter((user) => !hidden.some((name) => same(name, user.username)))
          .map(({ username, fullname, image }) => ({
            username,
            fullname,
            image,
          }));
        if (live) setResult({ term, people: found });
      } catch (error) {
        if (live) setResult({ term, error: errorMessage(error) });
      }
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [term, excluded]);

  // Keep the highlighted suggestion in view as the arrow keys move.
  useEffect(() => {
    if (index < 0) return;
    list.current
      ?.querySelector<HTMLElement>(`[id="${optionId(index)}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  });

  const choose = (person: IAuthor) => {
    setOpen(false);
    onSelect(person);
  };

  const move = (step: 1 | -1) => {
    if (!people.length) return;
    setOpen(true);
    const from = expanded ? index : step === 1 ? -1 : people.length;
    setActive({
      term,
      index: (from + step + people.length) % people.length,
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Enter":
        // Never submit anything: Enter only picks.
        event.preventDefault();
        if (expanded && index >= 0) choose(people[index]);
        break;
      case "Escape":
        // The list (or the text) goes first; the dialog closes on the next Escape.
        if (expanded) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        } else if (query) {
          event.preventDefault();
          event.stopPropagation();
          setQuery("");
        }
        break;
    }
  };

  let status = "";
  if (current && "error" in current) status = current.error;
  else if (current)
    status = people.length
      ? peopleFound(people.length)
      : `No one found for “${term}”`;

  return (
    <div>
      <label htmlFor={id} className="block text-[15px] font-bold">
        {label}
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={
          expanded && index >= 0 ? optionId(index) : undefined
        }
        aria-describedby={statusId}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="Search by name or @username"
        data-autofocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        className="mt-1 w-full rounded-md border border-line bg-transparent px-3 py-2 text-[17px] placeholder:text-muted focus:border-primary focus:outline-none"
      />
      <ul
        ref={list}
        id={listId}
        role="listbox"
        aria-label={`${label}: suggestions`}
        hidden={!expanded}
        className="mt-1 max-h-72 overflow-y-auto rounded-md border border-line py-1"
      >
        {people.map((person, i) => (
          <li
            key={person.username}
            id={optionId(i)}
            role="option"
            aria-selected={i === index}
            // Keep focus in the field: the pointer picks without moving it.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(person)}
            className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-fg/5 aria-selected:bg-primary/10"
          >
            <Avatar user={person} size={32} />
            <span className="min-w-0 leading-5">
              <span className="block truncate font-bold">
                {person.fullname}
              </span>
              <span className="block truncate text-muted">
                @{person.username}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p
        id={statusId}
        role="status"
        className={
          expanded || !status ? "sr-only" : "mt-2 text-[15px] text-muted"
        }
      >
        {term ? status : ""}
      </p>
    </div>
  );
}
