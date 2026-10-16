import { LIMITS } from "../../lib/superapp/limits";

/** Notes are counted in code points, like the server does (an emoji is one). */
export const noteLength = (note: string) => [...note].length;

export const noteTooLong = (note: string) => noteLength(note) > LIMITS.noteMax;

interface NoteFieldProps {
  /** The input's id, so the step can focus it when the note is too long. */
  id: string;
  label: string;
  value: string;
  onChange: (note: string) => void;
  placeholder?: string;
}

/**
 * An optional note of up to 100 characters with a live count. Going past
 * the limit is announced at once, since the step can't go on with it.
 */
export default function NoteField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: NoteFieldProps) {
  const length = noteLength(value);
  const tooLong = length > LIMITS.noteMax;

  return (
    <div>
      <label htmlFor={id} className="block text-[15px] font-bold">
        {label} <span className="font-normal text-muted">(optional)</span>
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={tooLong}
        aria-describedby={`${id}-count${tooLong ? ` ${id}-error` : ""}`}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-line bg-transparent px-3 py-2 text-[17px] placeholder:text-muted focus:border-primary focus:outline-none aria-[invalid=true]:border-danger"
      />
      <p
        id={`${id}-count`}
        className="mt-1 text-right text-[13px] tabular-nums text-muted"
      >
        {length}/{LIMITS.noteMax}
      </p>
      {tooLong && (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-danger">
          Notes are at most {LIMITS.noteMax} characters
        </p>
      )}
    </div>
  );
}
