import { describe, expect, it } from "vitest";
import { promptTemplates } from "@/lib/prompts";
import { renderPrompt } from "@/lib/prompt-render";

describe("renderPrompt", () => {
  it("renders prompt variables", () => {
    const template = promptTemplates.find((prompt) => prompt.id === "crop.outpaint.generate");
    expect(template).toBeDefined();

    const rendered = renderPrompt(template!, {
      cropBox: { x: -20, y: 0, width: 1200, height: 900 },
    });

    expect(rendered).toContain("same dimensions");
  });

  it("throws when required template variables are missing", () => {
    const template = promptTemplates.find((prompt) => prompt.id === "color.custom.generate");
    expect(() => renderPrompt(template!, {})).toThrow("Missing prompt variables");
  });
});
