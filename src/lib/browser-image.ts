import type { AdjustmentParams, CropBox, ImageAsset } from "@/lib/types";

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export async function fileToImageAsset(file: File): Promise<ImageAsset> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = await loadImage(dataUrl);

  return {
    id: crypto.randomUUID(),
    name: file.name,
    dataUrl,
    width: image.naturalWidth,
    height: image.naturalHeight,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Resize + JPEG-encode an image so it fits inside platform request-body limits
 * (Vercel: 4.5 MB; Cloud Run: 32 MB). The intermediate canvas operations and
 * source images both default to PNG which can easily exceed those limits when
 * the user uploads a phone photo. AI vision/image models internally downscale
 * to ~1024–1568 px anyway, so 1280 px max + JPEG q=0.82 is a safe ceiling
 * (≈300–600 KB after base64) without visibly hurting model quality. Returns a
 * data: URL ready to drop into a JSON payload.
 */
export async function compressImageForRequest(
  imageAsset: { dataUrl: string },
  options: { maxDimension?: number; quality?: number; skipBelowBytes?: number } = {},
): Promise<string> {
  const maxDim = options.maxDimension ?? 1280;
  const quality = options.quality ?? 0.82;
  // ~1 MB after base64 ≈ 1.33 M chars in the data URL. Anything smaller is
  // already well inside Vercel's 4.5 MB body limit, so skip the canvas dance.
  // Also makes the helper a no-op in jsdom-based tests where loadImage doesn't
  // resolve for fake data URLs.
  const skipBelow = options.skipBelowBytes ?? 1_000_000;
  if (imageAsset.dataUrl.length < skipBelow) return imageAsset.dataUrl;

  try {
    const image = await loadImage(imageAsset.dataUrl);
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    const ratio = longest > 0 ? Math.min(1, maxDim / longest) : 1;
    const w = Math.max(1, Math.round(image.naturalWidth * ratio));
    const h = Math.max(1, Math.round(image.naturalHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    // Fill white so JPEG (no alpha) doesn't end up with weird black
    // backgrounds for transparent PNGs.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(image, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    // Compression best-effort — fall back to the original data URL rather
    // than blocking the user's request entirely.
    return imageAsset.dataUrl;
  }
}

export async function dataUrlToAsset(dataUrl: string, name: string): Promise<ImageAsset> {
  const image = await loadImage(dataUrl);
  return {
    id: crypto.randomUUID(),
    name,
    dataUrl,
    width: image.naturalWidth || 1200,
    height: image.naturalHeight || 900,
    createdAt: new Date().toISOString(),
  };
}

export async function applyAdjustmentsToImage(
  imageAsset: ImageAsset,
  params: AdjustmentParams,
): Promise<ImageAsset> {
  const image = await loadImage(imageAsset.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available");
  }

  const brightness = 100 + (params.brightness ?? 0) + (params.exposure ?? 0);
  const contrast = 100 + (params.contrast ?? 0) + (params.brilliance ?? 0) * 0.35;
  const saturation = 100 + (params.saturation ?? 0) + (params.vibrance ?? 0) * 0.6;
  context.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
  context.drawImage(image, 0, 0);

  const shadows = params.shadows ?? 0;
  const highlights = params.highlights ?? 0;
  const warmth = params.warmth ?? 0;
  const tint = params.tint ?? 0;
  const blacks = params.blacks ?? 0;
  const brilliance = params.brilliance ?? 0;
  const shouldAdjustPixels =
    shadows !== 0 || highlights !== 0 || warmth !== 0 || tint !== 0 || blacks !== 0 || brilliance !== 0;

  if (shouldAdjustPixels) {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let index = 0; index < data.length; index += 4) {
      const luminance = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
      const shadowWeight = Math.max(0, 1 - luminance / 150);
      const highlightWeight = Math.max(0, (luminance - 120) / 135);
      const blackWeight = Math.max(0, 1 - luminance / 90);
      const brillianceDelta = brilliance * (0.7 * shadowWeight - 0.25 * highlightWeight);
      const toneDelta =
        shadows * 1.8 * shadowWeight +
        highlights * 1.2 * highlightWeight -
        blacks * 1.5 * blackWeight +
        brillianceDelta;

      data[index] = Math.max(0, Math.min(255, data[index] + toneDelta + warmth * 0.9 + tint * 0.35));
      data[index + 1] = Math.max(0, Math.min(255, data[index + 1] + toneDelta - tint * 0.25));
      data[index + 2] = Math.max(0, Math.min(255, data[index + 2] + toneDelta - warmth * 0.9 + tint * 0.35));
    }
    context.putImageData(imageData, 0, 0);
  }

  return dataUrlToAsset(canvas.toDataURL("image/png"), `${imageAsset.name}-adjusted.png`);
}

export async function cropImage(imageAsset: ImageAsset, crop: CropBox): Promise<ImageAsset> {
  const image = await loadImage(imageAsset.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available");
  }

  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  return dataUrlToAsset(canvas.toDataURL("image/png"), `${imageAsset.name}-crop.png`);
}

export async function createOutpaintGuideImage(
  imageAsset: ImageAsset,
  crop: CropBox,
  rotationDeg = 0,
): Promise<ImageAsset> {
  const image = await loadImage(imageAsset.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  if (rotationDeg) {
    // Rotate around the crop's anchor in source space (top-left of crop box),
    // then draw the source image so its origin maps to (-crop.x, -crop.y) in
    // the rotated frame.
    context.translate(-crop.x, -crop.y);
    context.translate(image.naturalWidth / 2, image.naturalHeight / 2);
    context.rotate((rotationDeg * Math.PI) / 180);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  } else {
    context.drawImage(image, -crop.x, -crop.y, image.naturalWidth, image.naturalHeight);
  }

  return dataUrlToAsset(canvas.toDataURL("image/png"), `${imageAsset.name}-outpaint-guide.png`);
}

/**
 * Crop a region from a source image, optionally with rotation applied first.
 * The crop rectangle is in the *rotated* image's coordinate space. The rotation
 * is performed about the source image's center, matching the live preview where
 * the displayed image rotates around its center underneath an axis-aligned
 * crop box.
 */
export async function cropImageWithRotation(
  imageAsset: ImageAsset,
  crop: CropBox,
  rotationDeg: number,
): Promise<ImageAsset> {
  if (!rotationDeg) return cropImage(imageAsset, crop);

  const image = await loadImage(imageAsset.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available");
  }

  // Rotate the source about its center, then position so that (crop.x, crop.y)
  // in the rotated frame lands at the canvas origin (0, 0).
  context.translate(-crop.x, -crop.y);
  context.translate(image.naturalWidth / 2, image.naturalHeight / 2);
  context.rotate((rotationDeg * Math.PI) / 180);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

  return dataUrlToAsset(canvas.toDataURL("image/png"), `${imageAsset.name}-crop.png`);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}
