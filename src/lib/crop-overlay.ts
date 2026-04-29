import type { CropBox } from "@/lib/types";

export type RenderedImageBox = {
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
};

export function cropToRenderedRect(crop: CropBox, box: RenderedImageBox) {
  const scaleX = box.width / box.naturalWidth;
  const scaleY = box.height / box.naturalHeight;

  return {
    left: crop.x * scaleX,
    top: crop.y * scaleY,
    width: crop.width * scaleX,
    height: crop.height * scaleY,
  };
}

export function renderedRectToCrop(
  rect: { left: number; top: number; width: number; height: number },
  box: RenderedImageBox,
): CropBox {
  const scaleX = box.naturalWidth / box.width;
  const scaleY = box.naturalHeight / box.height;

  return {
    x: Math.round(rect.left * scaleX),
    y: Math.round(rect.top * scaleY),
    width: Math.round(rect.width * scaleX),
    height: Math.round(rect.height * scaleY),
  };
}

export function normalizeRenderedRect(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  const left = rect.width < 0 ? rect.left + rect.width : rect.left;
  const top = rect.height < 0 ? rect.top + rect.height : rect.top;
  return {
    left,
    top,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}
