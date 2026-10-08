export default function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex justify-center p-6">
      <span
        aria-hidden="true"
        className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary/25 border-t-primary"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
