import { useRouter } from "next/router";
import { FormEvent, useId, useState } from "react";
import { HiOutlineMagnifyingGlass } from "react-icons/hi2";

/** Searches tweets: submits to /explore?q=… */
export default function SearchForm({
  initialQuery = "",
}: {
  initialQuery?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const id = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (q) router.push(`/explore?q=${encodeURIComponent(q)}`);
  };

  return (
    <form role="search" onSubmit={submit} className="py-1">
      <label htmlFor={id} className="sr-only">
        Search Twitter
      </label>
      <div className="group flex items-center gap-3 rounded-full border border-transparent bg-subtle px-4 focus-within:border-primary focus-within:bg-surface">
        <HiOutlineMagnifyingGlass
          aria-hidden="true"
          className="shrink-0 text-lg text-muted group-focus-within:text-primary"
        />
        <input
          id={id}
          type="search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Twitter"
          maxLength={100}
          autoComplete="off"
          className="w-full bg-transparent py-3 text-[15px] placeholder:text-muted focus:outline-none"
        />
      </div>
    </form>
  );
}
