import { useState } from "react";
import { HiOutlineShoppingBag } from "react-icons/hi2";

/**
 * A product's picture. With `size` it is a fixed square, so a slow or
 * broken image never shifts the layout; without, `className` sizes it.
 * Without an image (or when it fails) a bag icon stands in: the product's
 * name is always next to it, so the stand-in is decorative.
 */
export default function ProductThumb({
  image,
  alt,
  size,
  className = "",
}: {
  image: string | null;
  alt: string | null;
  /** Width and height in pixels. */
  size?: number;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const style = size ? { width: size, height: size } : undefined;

  if (!image || failedSrc === image) {
    return (
      <span
        aria-hidden="true"
        style={style}
        className={`flex shrink-0 items-center justify-center rounded-xl bg-subtle text-2xl text-muted ${className}`}
      >
        <HiOutlineShoppingBag />
      </span>
    );
  }

  return (
    // Studio may point at any https host, which next/image cannot allowlist.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt={alt ?? ""}
      width={size}
      height={size}
      style={style}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(image)}
      className={`shrink-0 rounded-xl bg-subtle object-cover ${className}`}
    />
  );
}
