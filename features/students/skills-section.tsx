"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addSkillAction,
  removeSkillAction,
} from "@/features/students/actions";

export type SkillsSectionItem = { id: string; name: string };

export function SkillsSection({ items }: { items: SkillsSectionItem[] }) {
  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-2" aria-label="Skills">
        {items.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            No skills yet. Add the technologies and tools you&apos;re comfortable with.
          </li>
        ) : (
          items.map((s) => (
            <li
              key={s.id}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-sm"
            >
              <span>{s.name}</span>
              <form action={removeSkillAction}>
                <input type="hidden" name="id" value={s.id} />
                <button
                  type="submit"
                  aria-label={`Remove ${s.name}`}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                >
                  ×
                </button>
              </form>
            </li>
          ))
        )}
      </ul>

      <form action={addSkillAction} className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="skill-name">Add a skill</Label>
          <Input
            id="skill-name"
            name="name"
            required
            maxLength={60}
            placeholder="e.g. TypeScript"
          />
        </div>
        <Button type="submit" variant="secondary">
          Add
        </Button>
      </form>
    </div>
  );
}
