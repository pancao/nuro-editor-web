import { describe, expect, it } from "vitest";
import { cropToRenderedRect, renderedRectToCrop } from "@/lib/crop-overlay";

describe("crop overlay coordinates", () => {
  it("maps image pixel crop coordinates to rendered image coordinates and back", () => {
    const box = { width: 500, height: 250, naturalWidth: 1000, naturalHeight: 500 };
    const crop = { x: 100, y: 50, width: 400, height: 200 };

    const rendered = cropToRenderedRect(crop, box);
    expect(rendered).toEqual({ left: 50, top: 25, width: 200, height: 100 });
    expect(renderedRectToCrop(rendered, box)).toEqual(crop);
  });
});
