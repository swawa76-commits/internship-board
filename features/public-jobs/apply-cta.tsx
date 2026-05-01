import { Button } from "@/components/ui/button";

/**
 * Apply CTA placeholder. The actual application flow lands in Task 11.
 * Until then this is a visually distinct button that points at an
 * anchor — clicking it doesn't submit anything, but it's clearly the
 * primary action on the page.
 *
 * Once Task 11 lands, this becomes a real `<form action={applyAction}>`
 * with the correct visibility-aware permissions baked in.
 */
export function ApplyCta({ jobId }: { jobId: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Button asChild size="lg" data-job-id={jobId}>
        <a href="#apply-coming-in-task-11">Apply</a>
      </Button>
      <p className="text-xs text-muted-foreground">
        Application flow ships in Task 11.
      </p>
    </div>
  );
}
