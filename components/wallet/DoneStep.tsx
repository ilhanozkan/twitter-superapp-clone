import { ReactNode, useEffect, useId, useRef } from "react";
import { HiCheckCircle } from "react-icons/hi2";

import { Button, ButtonLink } from "../common/Button";

/**
 * The last step of a money dialog: what happened, a link to see it, and
 * Done, which takes focus and reads the summary as its description.
 */
export default function DoneStep({
  title,
  children,
  link,
  onDone,
}: {
  title: string;
  children: ReactNode;
  link?: { href: string; label: string };
  onDone: () => void;
}) {
  const done = useRef<HTMLButtonElement>(null);
  const summaryId = useId();

  useEffect(() => {
    done.current?.focus();
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <HiCheckCircle aria-hidden="true" className="text-6xl text-success" />
      <h3 className="text-2xl font-extrabold">{title}</h3>
      <p id={summaryId} className="text-[15px] [overflow-wrap:anywhere]">
        {children}
      </p>
      <div className="mt-2 flex w-full flex-col gap-3">
        {link && (
          <ButtonLink
            href={link.href}
            onClick={onDone}
            variant="outline"
            size="lg"
          >
            {link.label}
          </ButtonLink>
        )}
        <Button
          ref={done}
          size="lg"
          onClick={onDone}
          aria-describedby={summaryId}
          data-autofocus
        >
          Done
        </Button>
      </div>
    </div>
  );
}
