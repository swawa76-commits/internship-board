"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addExperienceAction,
  removeExperienceAction,
} from "@/features/students/actions";

export type ExperienceItem = {
  id: string;
  title: string;
  organization: string;
  startDate: Date | null;
  endDate: Date | null;
  description: string | null;
};

function formatRange(start: Date | null, end: Date | null): string {
  if (!start && !end) return "";
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  const startLabel = start ? fmt(start) : "?";
  const endLabel = end ? fmt(end) : "Present";
  return `${startLabel} – ${endLabel}`;
}

export function ExperiencesSection({ items }: { items: ExperienceItem[] }) {
  return (
    <div className="space-y-4">
      <ul className="space-y-3" aria-label="Experiences">
        {items.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            No experiences yet. Add roles, internships, or research positions.
          </li>
        ) : (
          items.map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {e.title} <span className="text-muted-foreground">·</span>{" "}
                  {e.organization}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatRange(e.startDate, e.endDate) || "Dates not set"}
                </p>
                {e.description ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {e.description}
                  </p>
                ) : null}
              </div>
              <form action={removeExperienceAction}>
                <input type="hidden" name="id" value={e.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${e.title}`}
                >
                  Remove
                </Button>
              </form>
            </li>
          ))
        )}
      </ul>

      <form
        action={addExperienceAction}
        className="grid gap-3 rounded-md border border-dashed border-border p-4 sm:grid-cols-2"
      >
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor="experience-title">Title</Label>
          <Input id="experience-title" name="title" required maxLength={120} />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor="experience-org">Organization</Label>
          <Input
            id="experience-org"
            name="organization"
            required
            maxLength={160}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="experience-start">Start date</Label>
          <Input id="experience-start" name="startDate" type="date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="experience-end">End date</Label>
          <Input id="experience-end" name="endDate" type="date" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="experience-description">Description</Label>
          <Textarea
            id="experience-description"
            name="description"
            rows={3}
            maxLength={1500}
          />
        </div>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" variant="secondary">
            Add experience
          </Button>
        </div>
      </form>
    </div>
  );
}
