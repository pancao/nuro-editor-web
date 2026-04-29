import { describe, expect, it, vi } from "vitest";
import { createOutpaintGuideImage } from "@/lib/browser-image";
import type { ImageAsset } from "@/lib/types";

describe("createOutpaintGuideImage", () => {
  it("creates a target-size guide canvas for AI outpaint", async () => {
    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => "data:image/png;base64,guide");
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect: vi.fn(),
        drawImage,
      }),
      toDataURL,
    };

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "canvas") return canvas as unknown as HTMLCanvasElement;
      const image = originalCreateElement(tagName) as HTMLImageElement;
      Object.defineProperties(image, {
        naturalWidth: { value: 1000 },
        naturalHeight: { value: 800 },
        src: {
          set() {
            setTimeout(() => image.onload?.(new Event("load")));
          },
        },
      });
      return image;
    });

    const image: ImageAsset = {
      id: "image-1",
      name: "photo.png",
      dataUrl: "data:image/png;base64,abc",
      width: 1000,
      height: 800,
      createdAt: "now",
    };

    await createOutpaintGuideImage(image, {
      x: -120,
      y: 40,
      width: 1400,
      height: 900,
    });

    expect(canvas.width).toBe(1400);
    expect(canvas.height).toBe(900);
    expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLImageElement), 120, -40, 1000, 800);
  });
});
