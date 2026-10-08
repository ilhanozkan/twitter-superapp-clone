import { useEffect, useRef, useState } from "react";

import { IAuthor } from "../../types/User";

interface AvatarProps {
  user: Pick<IAuthor, "fullname" | "image">;
  /** Diameter in pixels. */
  size?: number;
  className?: string;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? parts[0][0] + parts[parts.length - 1][0]
      : name.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * A round avatar with a fixed size, so a slow or broken image never shifts
 * the layout. Falls back to the user's initials when there is no image or it
 * fails to load. Decorative: the user's name is always shown next to it.
 */
export default function Avatar({
  user,
  size = 40,
  className = "",
}: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const style = { width: size, height: size };

  // An image can fail before React hydrates and attaches onError.
  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth === 0 && user.image) {
      setFailedSrc(user.image);
    }
  }, [user.image]);

  if (!user.image || failedSrc === user.image) {
    return (
      <span
        aria-hidden="true"
        style={{ ...style, fontSize: Math.round(size * 0.38) }}
        className={`flex shrink-0 select-none items-center justify-center rounded-full bg-primary/15 font-bold text-primary ${className}`}
      >
        {initials(user.fullname)}
      </span>
    );
  }

  return (
    // Avatars can come from any https host, which next/image cannot allowlist.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={image}
      src={user.image}
      alt=""
      width={size}
      height={size}
      style={style}
      decoding="async"
      onError={() => setFailedSrc(user.image)}
      className={`shrink-0 rounded-full bg-subtle object-cover ${className}`}
    />
  );
}
