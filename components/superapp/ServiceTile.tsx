import Link from "next/link";
import { IconType } from "react-icons";

interface ServiceTileProps {
  title: string;
  description: string;
  icon: IconType;
  /** A page to go to... */
  href?: string;
  /** ...or something to open here (the story composer). */
  onSelect?: () => void;
}

const TILE =
  "relative flex h-full flex-col gap-2 rounded-2xl border border-line p-4 transition-colors hover:bg-fg/[0.03]";

/**
 * A Services launcher tile with its heading and description. A link tile
 * is one link; an action tile's button sits in the heading and stretches
 * over the tile (a button can't contain a heading).
 */
export default function ServiceTile({
  title,
  description,
  icon: Icon,
  href,
  onSelect,
}: ServiceTileProps) {
  const content = (
    <>
      <Icon aria-hidden="true" className="text-2xl text-primary" />
      <h2 className="text-[17px] font-bold leading-6">
        {onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            className="text-left after:absolute after:inset-0 after:rounded-2xl"
          >
            {title}
          </button>
        ) : (
          title
        )}
      </h2>
      <p className="text-[13px] leading-4 text-muted">{description}</p>
    </>
  );

  if (onSelect || !href) return <div className={TILE}>{content}</div>;
  return (
    <Link href={href} className={TILE}>
      {content}
    </Link>
  );
}
