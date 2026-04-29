import { describe, expect, it } from "vitest";
import { collectBatchSuggestionTargets, normalizeSuggestionGroups, suggestionCacheKey } from "@/lib/suggestions";
import type { ImageAsset } from "@/lib/types";

describe("suggestion helpers", () => {
  it("collects enabled AI suggestion actions and excludes custom-only/manual actions", () => {
    const targets = collectBatchSuggestionTargets();
    const ids = targets.map((target) => `${target.toolId}:${target.actionId}`);

    expect(ids).toContain("color:filter");
    expect(ids).toContain("style:default");
    expect(ids).toContain("remove:default");
    expect(ids).toContain("face:expression");
    expect(ids).not.toContain("light:auto-exposure");
    expect(ids).not.toContain("color:customize");
    expect(ids).not.toContain("crop:frame");
  });

  it("normalizes grouped suggestions by image, tool, and action", () => {
    const image: ImageAsset = {
      id: "image-1",
      name: "photo.png",
      dataUrl: "data:image/png;base64,abc",
      width: 100,
      height: 100,
      createdAt: "now",
    };

    const cache = normalizeSuggestionGroups(image, [
      {
        toolId: "style",
        actionId: "default",
        suggestions: [{ id: "comic", label: "Comic", prompt: "make comic" }],
      },
    ]);

    expect(cache[suggestionCacheKey("image-1", "style", "default")]).toHaveLength(1);
  });
});
