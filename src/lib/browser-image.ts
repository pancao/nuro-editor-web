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
  context.drawImage(image, -crop.x, -crop.y, image.naturalWidth, image.naturalHeight);

  return dataUrlToAsset(canvas.toDataURL("image/png"), `${imageAsset.name}-outpaint-guide.png`);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}
