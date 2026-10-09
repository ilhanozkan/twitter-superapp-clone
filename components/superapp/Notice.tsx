import { ReactNode } from "react";
import {
  HiOutlineExclamationTriangle,
  HiOutlineInformationCircle,
} from "react-icons/hi2";

const tones = {
  info: { icon: HiOutlineInformationCircle, className: "text-primary" },
  danger: { icon: HiOutlineExclamationTriangle, className: "text-danger" },
};

/** A banner at the top of a page: icon and text, never colour alone. */
export default function Notice({
  tone,
  children,
}: {
  tone: keyof typeof tones;
  children: ReactNode;
}) {
  const Icon = tones[tone].icon;
  return (
    <div className="flex gap-3 border-b border-line bg-subtle px-4 py-3 text-[15px]">
      <Icon
        aria-hidden="true"
        className={`mt-0.5 shrink-0 text-xl ${tones[tone].className}`}
      />
      <p className="min-w-0">{children}</p>
    </div>
  );
}
