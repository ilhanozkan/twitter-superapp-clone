export default function TweetImage({ src }: { src: string }) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-line">
      {/* Tweet images can come from any https host, which next/image cannot allowlist. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="max-h-[510px] w-full bg-subtle object-cover"
      />
    </div>
  );
}
