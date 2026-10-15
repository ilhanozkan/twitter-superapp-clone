import Link from "next/link";
import { ComponentProps } from "react";

const variants = {
  primary: "bg-primary-fill text-white hover:bg-primary-fill-hover",
  dark: "bg-fg text-surface hover:bg-fg/85",
  outline: "border border-line text-fg hover:bg-fg/5",
};

const sizes = {
  sm: "min-h-8 px-4 text-sm",
  md: "min-h-9 px-4 text-[15px]",
  lg: "min-h-[52px] px-8 text-[17px]",
};

interface StyleProps {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

function classes({ variant = "primary", size = "md" }: StyleProps, extra = "") {
  return `inline-flex items-center justify-center rounded-full font-bold transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & StyleProps) {
  return (
    <button
      type="button"
      className={classes({ variant, size }, className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={classes({ variant, size }, className)} {...props} />;
}
