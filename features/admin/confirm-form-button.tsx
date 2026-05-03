"use client";

import { Button } from "@/components/ui/button";

/**
 * One-click destructive submit button with a `confirm()` gate. Used by
 * admin soft-delete forms; the parent renders the form + hidden inputs
 * so this stays a leaf client component (no server actions imported).
 */
export function ConfirmFormButton({
  label,
  confirmMessage,
  variant = "destructive",
  size = "sm",
}: {
  label: string;
  confirmMessage: string;
  variant?: "destructive" | "ghost" | "outline";
  size?: "sm" | "default";
}) {
  return (
    <Button
      type="submit"
      size={size}
      variant={variant}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {label}
    </Button>
  );
}
