import { describe, expect, it } from "vitest";
import { isCropWithinImage } from "@/lib/crop";

describe("isCropWithinImage", () => {
  const image = { width: 1000, height: 800 };

  it("returns true when every edge stays inside the image", () => {
    expect(isCropWithinImage({ x: 100, y: 80, width: 600, height: 500 }, image)).toBe(true);
  });

  it("returns false when any edge exceeds the original image", () => {
    expect(isCropWithinImage({ x: -1, y: 0, width: 600, height: 500 }, image)).toBe(false);
    expect(isCropWithinImage({ x: 0, y: 0, width: 1001, height: 500 }, image)).toBe(false);
    expect(isCropWithinImage({ x: 100, y: 700, width: 100, height: 101 }, image)).toBe(false);
  });
});
