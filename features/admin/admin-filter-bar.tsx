import Link from "next/link";

/**
 * GET-form filter bar shared by every /admin/* list page. Each field
 * defines its own `name` and `defaultValue`; the form submits to the
 * page itself with the new query string. Every field is just an HTML
 * input — no client React state, no form libs.
 *
 * Pages that need a different layout can compose this directly. The
 * shape stays minimal so individual pages add their own SelectField /
 * TextField groupings inline.
 */

export function AdminFilterBar({
  resetHref,
  hasAny,
  children,
}: {
  resetHref: string;
  hasAny: boolean;
  children: React.ReactNode;
}) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-4 text-sm"
    >
      {children}
      <button
        type="submit"
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
      >
        Apply
      </button>
      {hasAny ? (
        <Link href={resetHref} className="text-sm font-medium hover:underline">
          Reset
        </Link>
      ) : null}
    </form>
  );
}

export function TextField({
  name,
  label,
  defaultValue,
  placeholder,
  className,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <label
        htmlFor={name}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="w-full min-w-48 rounded-md border border-input bg-background px-3 py-1.5"
      />
    </div>
  );
}

export function SelectField({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={name}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        className="rounded-md border border-input bg-background px-3 py-1.5"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
