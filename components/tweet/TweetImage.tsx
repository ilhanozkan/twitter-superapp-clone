/**
 * Tweets have no alt text yet, so screen readers at least learn that there
 * is an image (as twitter.com does without a description).
 */
export default function TweetImage({ src }: { src: string }) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-line">
      {/* Tweet images can come from any https host, which next/image cannot allowlist. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Image"
        loading="lazy"
        decoding="async"
        className="max-h-[510px] w-full bg-subtle object-cover"
      />
    </div>
  );
}
