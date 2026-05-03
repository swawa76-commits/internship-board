/**
 * Inline unread-count pill for the global nav. Renders nothing when
 * `count` is 0 so the nav stays tidy. Capped at 99+ for layout.
 */
export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      aria-label={`${count} unread`}
      className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 font-mono text-[10px] leading-none text-primary-foreground"
    >
      {label}
    </span>
  );
}
