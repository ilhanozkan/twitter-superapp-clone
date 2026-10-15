import Notice from "./Notice";

/** A wallet a moderator froze in Studio (a walletFreeze document). */
export default function FrozenNotice() {
  return (
    <Notice tone="danger">
      <strong>A moderator froze this wallet.</strong> You can’t send or receive
      credits right now. Refunds still reach you.
    </Notice>
  );
}
