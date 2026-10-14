import { useRouter } from "next/router";
import { FormEvent, useId, useState } from "react";

import { ApiRequestError, errorMessage } from "../../lib/client/api";
import { textLength } from "../../lib/constants";
import { LIMITS } from "../../lib/superapp/limits";
import { CHANNEL_HANDLE_PATTERN } from "../../lib/superapp/messages";
import { createChannel } from "../../slices/channelsSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch } from "../../store";
import { Button } from "../common/Button";
import Dialog from "../common/Dialog";
import { channelPath } from "./paths";

const { nameMax, descriptionMax, createdPerUser } = LIMITS.channels;

type Field = "name" | "handle" | "description";

/** A handle suggested from the name: "Ankara Eats!" → "ankara_eats". */
export function suggestHandle(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

/** What is wrong with each field as typed, before asking the server. */
function check(name: string, handle: string, description: string) {
  const errors: Partial<Record<Field, string>> = {};
  if (!name.trim()) errors.name = "Give the channel a name.";
  else if (textLength(name.trim()) > nameMax)
    errors.name = `Names are up to ${nameMax} characters.`;
  if (!CHANNEL_HANDLE_PATTERN.test(handle))
    errors.handle = "Use 3 to 30 lower-case letters, numbers or _.";
  if (textLength(description.trim()) > descriptionMax)
    errors.description = `Descriptions are up to ${descriptionMax} characters.`;
  return errors;
}

/** The server's answer, as field errors where it names a field. */
function serverErrors(reason: unknown): {
  fields: Partial<Record<Field, string>>;
  form: string | null;
} {
  if (reason instanceof ApiRequestError && reason.code === "conflict") {
    return {
      fields: { handle: "That handle is taken. Try another one." },
      form: null,
    };
  }
  return { fields: {}, form: errorMessage(reason) };
}

interface CreateChannelDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * "Create channel": a name (≤50), a handle (suggested from the name until
 * edited) and an optional description (≤160). Errors show next to their
 * field; on success the new channel opens.
 */
export default function CreateChannelDialog({
  open,
  onClose,
}: CreateChannelDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create channel"
      variant="sheet"
    >
      {/* Mounted only while open, so every opening starts blank. */}
      {open && <CreateChannelForm onClose={onClose} />}
    </Dialog>
  );
}

function CreateChannelForm({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleEdited, setHandleEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const ids = {
    name: `${id}-name`,
    handle: `${id}-handle`,
    description: `${id}-description`,
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = check(name, handle, description);
    setErrors(found);
    setFormError(null);
    const first = (["name", "handle", "description"] as const).find(
      (field) => found[field]
    );
    if (first) {
      document.getElementById(ids[first])?.focus();
      return;
    }

    setBusy(true);
    try {
      const channel = await dispatch(
        createChannel({
          handle,
          name: name.trim(),
          description: description.trim() || null,
        })
      );
      onClose();
      dispatch(showToast({ message: `#${channel.handle} is ready` }));
      await router.push(channelPath(channel.handle));
    } catch (reason) {
      const { fields, form } = serverErrors(reason);
      setErrors(fields);
      setFormError(form);
      if (fields.handle) document.getElementById(ids.handle)?.focus();
    } finally {
      setBusy(false);
    }
  };

  const describedBy = (field: Field, hint?: string) =>
    [hint, errors[field] ? `${ids[field]}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const fieldError = (field: Field) =>
    errors[field] && (
      <p id={`${ids[field]}-error`} className="mt-1 text-[13px] text-danger">
        {errors[field]}
      </p>
    );

  const inputClass =
    "mt-1 block w-full rounded-md border border-line bg-transparent px-3 py-2 text-[15px] focus:border-primary focus:outline-none aria-[invalid=true]:border-danger";

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-busy={busy}
      className="flex flex-col gap-4"
    >
      <div>
        <label htmlFor={ids.name} className="block text-[15px] font-bold">
          Name
        </label>
        <input
          id={ids.name}
          data-autofocus
          value={name}
          maxLength={nameMax * 2}
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
            if (!handleEdited) setHandle(suggestHandle(event.target.value));
          }}
          aria-invalid={!!errors.name}
          aria-describedby={describedBy("name")}
          className={inputClass}
        />
        {fieldError("name")}
      </div>

      <div>
        <label htmlFor={ids.handle} className="block text-[15px] font-bold">
          Handle
        </label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 pt-0.5 text-[15px] text-muted"
          >
            #
          </span>
          <input
            id={ids.handle}
            value={handle}
            maxLength={30}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => {
              setHandleEdited(true);
              setHandle(event.target.value.toLowerCase().replace(/\s/g, "_"));
            }}
            aria-invalid={!!errors.handle}
            aria-describedby={describedBy("handle", `${ids.handle}-hint`)}
            className={`${inputClass} pl-7`}
          />
        </div>
        <p id={`${ids.handle}-hint`} className="mt-1 text-[13px] text-muted">
          3 to 30 lower-case letters, numbers or _. It can’t be changed later.
        </p>
        {fieldError("handle")}
      </div>

      <div>
        <label
          htmlFor={ids.description}
          className="block text-[15px] font-bold"
        >
          Description <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id={ids.description}
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          aria-invalid={!!errors.description}
          aria-describedby={describedBy("description")}
          className={`${inputClass} resize-none`}
        />
        {fieldError("description")}
      </div>

      <p className="text-[13px] text-muted">
        Anyone can read a channel and join it to post. You can create up to{" "}
        {createdPerUser} channels.
      </p>

      {formError && (
        <p
          role="alert"
          className="rounded-md border border-danger px-3 py-2 text-[15px] text-danger"
        >
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" aria-disabled={busy}>
        {busy ? "Creating…" : "Create channel"}
      </Button>
    </form>
  );
}
