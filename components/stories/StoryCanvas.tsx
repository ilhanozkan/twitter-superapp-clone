import { useEffect, useRef, useState } from "react";

import { storyBackgroundColor } from "../../lib/superapp/stories";
import { StoryContent } from "../../types/Story";

interface StoryCanvasProps {
  content: StoryContent;
  /** Called once an image story's photo has loaded or failed (text is ready at once). */
  onReady?: () => void;
  className?: string;
}

/**
 * A story at 9:16. Text stories are white on one of the six backgrounds
 * (each at least 5:1); photos are letterboxed (`object-contain`) on black
 * with their alt text and an optional caption. Sizes scale with the canvas
 * width (container units), so the composer's small preview matches the
 * viewer.
 */
export default function StoryCanvas({
  content,
  onReady,
  className = "",
}: StoryCanvasProps) {
  const frame = `relative aspect-[9/16] w-full overflow-hidden rounded-xl text-white [container-type:inline-size] ${className}`;

  if (content.type === "text") {
    return (
      <div
        data-background={content.background}
        style={{ backgroundColor: storyBackgroundColor(content.background) }}
        className={frame}
      >
        <p className="absolute inset-0 flex items-center justify-center whitespace-pre-wrap p-[8cqw] text-center text-[clamp(13px,8cqw,36px)] font-bold leading-tight [overflow-wrap:anywhere]">
          {content.text}
        </p>
      </div>
    );
  }
  return <ImageStory content={content} onReady={onReady} frame={frame} />;
}

function ImageStory({
  content,
  onReady,
  frame,
}: {
  content: Extract<StoryContent, { type: "image" }>;
  onReady?: () => void;
  frame: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const ready = useRef(onReady);
  const failed = failedSrc === content.image;

  useEffect(() => {
    ready.current = onReady;
  });

  // A cached photo can finish loading before React attaches onLoad.
  useEffect(() => {
    const element = image.current;
    if (!element?.complete) return;
    if (element.naturalWidth === 0) setFailedSrc(content.image);
    ready.current?.();
  }, [content.image]);

  return (
    <div className={`${frame} bg-black`}>
      {failed ? (
        <p className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-[8cqw] text-center text-[clamp(12px,5cqw,18px)]">
          <span className="font-bold">This photo couldn’t load.</span>
          <span>{content.alt}</span>
        </p>
      ) : (
        // Story photos can come from any https host, which next/image
        // cannot allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={image}
          src={content.image}
          alt={content.alt}
          decoding="async"
          onLoad={() => onReady?.()}
          onError={() => {
            setFailedSrc(content.image);
            onReady?.();
          }}
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}
      {content.caption && (
        <p className="absolute inset-x-0 bottom-0 bg-black/70 px-[6cqw] py-[4cqw] text-center text-[clamp(12px,5cqw,20px)] font-bold [overflow-wrap:anywhere]">
          {content.caption}
        </p>
      )}
    </div>
  );
}
