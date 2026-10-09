import Notice from "./Notice";

/** Shown instead of money actions when the server rejects writes. */
export default function ReadOnlyNotice({
  children = "Payments are turned off on this read-only demo.",
}: {
  children?: string;
}) {
  return <Notice tone="info">{children}</Notice>;
}
