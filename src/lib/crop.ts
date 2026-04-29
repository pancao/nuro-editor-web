import type { CropBox } from "@/lib/types";

export function isCropWithinImage(crop: CropBox, image: { width: number; height: number }) {
  return (
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= image.width &&
    crop.y + crop.height <= image.height
  );
}
