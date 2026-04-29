"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addProjectAction,
  removeProjectAction,
} from "@/features/students/actions";

export type ProjectItem = {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
};

export function ProjectsSection({ items }: { items: ProjectItem[] }) {
  return (
    <div className="space-y-4">
      <ul className="space-y-3" aria-label="Projects">
        {items.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            No projects yet. Showcase a class project, side project, or
            anything you built.
          </li>
        ) : (
          items.map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {p.name}
                  {p.url ? (
                    <>
                      {" "}
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground underline hover:text-foreground"
                      >
                        link
                      </a>
                    </>
                  ) : null}
                </p>
                {p.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {p.description}
                  </p>
                ) : null}
              </div>
              <form action={removeProjectAction}>
                <input type="hidden" name="id" value={p.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${p.name}`}
                >
                  Remove
                </Button>
              </form>
            </li>
          ))
        )}
      </ul>

      <form
        action={addProjectAction}
        className="grid gap-3 rounded-md border border-dashed border-border p-4 sm:grid-cols-2"
      >
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor="project-name">Project name</Label>
          <Input id="project-name" name="name" required maxLength={120} />
        </div>
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor="project-url">URL</Label>
          <Input
            id="project-url"
            name="url"
            type="url"
            inputMode="url"
            placeholder="https://"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="project-description">Description</Label>
          <Textarea
            id="project-description"
            name="description"
            rows={3}
            maxLength={1500}
          />
        </div>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" variant="secondary">
            Add project
          </Button>
        </div>
      </form>
    </div>
  );
}
