import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Apply now</Button>);
    expect(
      screen.getByRole("button", { name: "Apply now" }),
    ).toBeInTheDocument();
  });

  it("applies the requested variant class", () => {
    render(<Button variant="outline">Outline</Button>);
    const btn = screen.getByRole("button", { name: "Outline" });
    expect(btn.className).toContain("border");
  });
});
