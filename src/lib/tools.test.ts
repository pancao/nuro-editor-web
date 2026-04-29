import { describe, expect, it } from "vitest";
import { editorTools } from "@/lib/tools";

describe("editorTools", () => {
  it("declares all enabled MVP tools with actions and flows", () => {
    const enabled = editorTools.filter((tool) => tool.enabled);
    expect(enabled.map((tool) => tool.id)).toEqual([
      "light",
      "color",
      "style",
      "crop",
      "remove",
      "add",
      "change",
      "face",
      "focus",
      "hd",
    ]);

    for (const tool of enabled) {
      expect(tool.icon).toBeTruthy();
      expect(tool.actions.length).toBeGreaterThan(0);
      for (const action of tool.actions) {
        expect(action.flow).toMatch(
          /system-adjust|ai-suggest-params|ai-suggest-generate|ai-custom-generate|crop-or-outpaint/,
        );
      }
    }
  });

  it("keeps placeholder modules disabled", () => {
    const disabled = editorTools.filter((tool) => !tool.enabled).map((tool) => tool.id);
    expect(disabled).toEqual(["cloths", "time", "env", "shading", "create"]);
  });
});
