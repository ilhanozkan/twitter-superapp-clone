import { ComponentProps, SyntheticEvent } from "react";

import Dialog from "../common/Dialog";

/**
 * A Dialog that may open inside another one (the product picker in the
 * Compose dialog, the new-cart prompt in a product's details). The DOM's
 * close event doesn't bubble, but React passes it up the component tree,
 * so closing this dialog would also close the one around it and lose its
 * state. Dialog hands its <dialog>'s close event to `onClose`: it stops
 * here.
 */
export default function NestedDialog({
  onClose,
  ...props
}: ComponentProps<typeof Dialog>) {
  return (
    <Dialog
      {...props}
      onClose={(event?: SyntheticEvent) => {
        if (event?.type === "close") event.stopPropagation();
        onClose();
      }}
    />
  );
}
