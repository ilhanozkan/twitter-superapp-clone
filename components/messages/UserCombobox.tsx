import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { HiOutlineMagnifyingGlass } from "react-icons/hi2";

import { errorMessage } from "../../lib/client/api";
import { walletApi } from "../../lib/client/walletApi";
import { IAuthor } from "../../types/User";
import Avatar from "../common/Avatar";

interface UserComboboxProps {
  label: string;
  /** Offered while the field is empty, e.g. people from recent conversations. */
  suggestions: IAuthor[];
  /** Never offered (the viewer). */
  exclude: string;
  onSelect: (user: IAuthor) => void;
}

const SEARCH_DELAY_MS = 250;
const RESULTS = 8;

const toAuthor = ({ username, fullname, image }: IAuthor): IAuthor => ({
  username,
  fullname,
  image,
});

/**
 * Finds a person to message: an ARIA 1.2 combobox over GET /api/users?q=
 * with a listbox, `aria-activedescendant` and the number of results read
 * out politely. Arrow keys move through the options, Enter picks one and
 * Escape closes the list (a second Escape closes the dialog).
 */
export default function UserCombobox({
  label,
  suggestions,
  exclude,
  onSelect,
}: UserComboboxProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    query: string;
    users: IAuthor[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [closed, setClosed] = useState(false);
  const latest = useRef(0);
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const term = query.trim();
  useEffect(() => {
    if (!term) return;
    const request = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const { items } = await walletApi.searchUsers(term, RESULTS);
        if (request !== latest.current) return;
        setResults({
          query: term,
          users: items
            .filter(
              (user) => user.username.toLowerCase() !== exclude.toLowerCase()
            )
            .map(toAuthor),
        });
        setError(null);
      } catch (reason) {
        if (request === latest.current) setError(errorMessage(reason));
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [term, exclude]);

  const searched = results?.query === term ? results.users : null;
  const options = term ? (searched ?? []) : suggestions;
  const expanded = !closed && options.length > 0;
  const status = !term
    ? ""
    : error
      ? error
      : searched === null
        ? ""
        : searched.length === 0
          ? "No people found"
          : `${searched.length} ${searched.length === 1 ? "person" : "people"} found`;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      setClosed(false);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) =>
        index < 0 && step < 0
          ? options.length - 1
          : (index + step + options.length) % options.length
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const user = expanded ? options[active] : undefined;
      if (user) onSelect(user);
    } else if (event.key === "Escape" && expanded) {
      // Close the list only; the dialog stays open.
      event.preventDefault();
      event.stopPropagation();
      setClosed(true);
      setActive(-1);
    }
  };

  return (
    <div>
      <label htmlFor={id} className="block text-[15px] font-bold">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2 rounded-full border border-line px-4 focus-within:border-primary">
        <HiOutlineMagnifyingGlass
          aria-hidden="true"
          className="shrink-0 text-lg text-muted"
        />
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={
            expanded && active >= 0 && active < options.length
              ? optionId(active)
              : undefined
          }
          data-autofocus
          value={query}
          placeholder="Search people"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(-1);
            setClosed(false);
          }}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] placeholder:text-muted focus:outline-none"
        />
      </div>
      <p role="status" className="sr-only">
        {status}
      </p>
      {!term && suggestions.length > 0 && expanded && (
        <p className="mt-3 px-1 text-[13px] font-bold text-muted">Recent</p>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label={term ? "People" : "Recent conversations"}
        hidden={!expanded}
        className="mt-2 max-h-80 overflow-y-auto"
      >
        {options.map((user, index) => (
          <li
            key={user.username}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            // Keep focus in the field while the option is clicked.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(user)}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-fg/5 aria-selected:bg-fg/10"
          >
            <Avatar user={user} />
            <span className="min-w-0 leading-5">
              <span className="block truncate font-bold">{user.fullname}</span>
              <span className="block truncate text-muted">
                @{user.username}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {/* Visible copies of what the status above reads out. */}
      {term && searched?.length === 0 && (
        <p aria-hidden="true" className="mt-3 px-1 text-[15px] text-muted">
          No people found
        </p>
      )}
      {term && error && (
        <p aria-hidden="true" className="mt-3 px-1 text-[15px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
