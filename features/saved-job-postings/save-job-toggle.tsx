import { Button } from "@/components/ui/button";
import { toggleSavedJobAction } from "@/features/saved-job-postings/actions";

/**
 * Save / unsave toggle. Server-rendered form posting to a server
 * action — no client JS required. Caller resolves `isSaved` via
 * `isJobSavedByStudent`. Hidden when `hidden` is true (anonymous
 * visitors, non-students, the student's own listing surfaces).
 */
export function SaveJobToggle({
  jobPostingId,
  isSaved,
  size = "sm",
}: {
  jobPostingId: string;
  isSaved: boolean;
  size?: "sm" | "default" | "lg";
}) {
  return (
    <form action={toggleSavedJobAction}>
      <input type="hidden" name="jobPostingId" value={jobPostingId} />
      <input
        type="hidden"
        name="intent"
        value={isSaved ? "unsave" : "save"}
      />
      <Button
        type="submit"
        size={size}
        variant={isSaved ? "secondary" : "outline"}
        aria-pressed={isSaved}
      >
        {isSaved ? "Saved" : "Save"}
      </Button>
    </form>
  );
}
