import type { AdjustmentParams, AISuggestion, CropBox, ToolId } from "@/lib/types";

const suggestionCopy: Partial<Record<ToolId, AISuggestion[]>> = {
  color: [
    { id: "clean-pop", label: "Clean Pop", prompt: "bright clean color with gentle contrast" },
    { id: "film-warm", label: "Warm Film", prompt: "warm film color with soft blacks" },
    { id: "cool-editorial", label: "Cool Editorial", prompt: "cool editorial color and muted saturation" },
    { id: "soft-pastel", label: "Soft Pastel", prompt: "soft pastel color with lifted shadows" },
    { id: "rich-natural", label: "Rich Natural", prompt: "natural color with richer midtone depth" },
  ],
  style: [
    { id: "comic", label: "Comic", prompt: "turn into a polished comic illustration" },
    { id: "sketch", label: "Line Sketch", prompt: "turn into a clean pencil line sketch" },
    { id: "polaroid", label: "Polaroid", prompt: "give the image a candid Polaroid look" },
    { id: "toy", label: "Toy", prompt: "make the subject look like a collectible toy photo" },
    { id: "memoji", label: "Memoji", prompt: "turn the main subject into a polished memoji-like character" },
  ],
  remove: [
    { id: "watermark", label: "Watermark", prompt: "remove visible watermark or logo marks" },
    { id: "reflection", label: "Reflection", prompt: "remove distracting reflections" },
    { id: "clutter", label: "Clutter", prompt: "remove background clutter" },
    { id: "blemish", label: "Blemish", prompt: "remove small blemishes or dust while keeping texture natural" },
    { id: "stray-object", label: "Stray Object", prompt: "remove a distracting stray object from the scene" },
  ],
  add: [
    { id: "flowers", label: "Flowers", prompt: "add subtle flowers that match the scene" },
    { id: "lamp", label: "Soft Lamp", prompt: "add a soft practical light source" },
    { id: "prop", label: "Creative Prop", prompt: "add a tasteful creative prop" },
    { id: "sky-detail", label: "Sky Detail", prompt: "add natural sky detail that fits the scene" },
    { id: "ambient-light", label: "Ambient Glow", prompt: "add a subtle ambient glow matching existing light" },
  ],
  change: [
    { id: "turn", label: "Turn Body", prompt: "slightly turn the person toward camera" },
    { id: "angle", label: "Low Angle", prompt: "change to a subtle lower camera angle" },
    { id: "mood", label: "New Mood", prompt: "shift the scene to a cinematic mood" },
    { id: "lighting", label: "Relight", prompt: "change the scene lighting naturally" },
    { id: "background", label: "Background", prompt: "subtly change the background while preserving the subject" },
  ],
  face: [
    { id: "smile", label: "Soft Smile", prompt: "make expression a gentle smile" },
    { id: "hair", label: "Hair Color", prompt: "try a natural alternate hair color" },
    { id: "light", label: "Face Light", prompt: "improve flattering face light" },
    { id: "skin", label: "Even Skin", prompt: "even skin tone naturally without plastic smoothing" },
    { id: "angle", label: "Face Angle", prompt: "slightly adjust face angle while preserving identity" },
  ],
  focus: [
    { id: "person", label: "Person", prompt: "focus on the main person" },
    { id: "foreground", label: "Foreground", prompt: "focus on the foreground subject" },
    { id: "product", label: "Product", prompt: "focus on the main product or object" },
    { id: "background-soft", label: "Soft Backdrop", prompt: "soften the background while keeping subject sharp" },
    { id: "eye-focus", label: "Eye Focus", prompt: "make the eyes or key subject detail feel sharper" },
  ],
  hd: [
    { id: "enhance", label: "Enhance", prompt: "increase clarity and resolution naturally" },
    { id: "restore", label: "Restore", prompt: "restore fine details while keeping the photo natural" },
    { id: "denoise", label: "Denoise", prompt: "reduce noise and preserve realistic texture" },
    { id: "sharpen", label: "Sharpen", prompt: "sharpen important details without halos" },
    { id: "print", label: "Print Ready", prompt: "make the image cleaner for high quality printing" },
  ],
};

export function mockSuggestions(toolId: ToolId): AISuggestion[] {
  return suggestionCopy[toolId] ?? [
    { id: "natural", label: "Natural", prompt: "make a natural useful edit" },
    { id: "dramatic", label: "Dramatic", prompt: "make a more dramatic version" },
    { id: "clean", label: "Clean", prompt: "make the result clean and polished" },
    { id: "soft", label: "Soft", prompt: "make a softer refined version" },
    { id: "editorial", label: "Editorial", prompt: "make a tasteful editorial version" },
  ];
}

export function mockParams(seed: string): AdjustmentParams {
  if (seed.includes("warm")) {
    return { exposure: 8, brightness: 6, contrast: 5, saturation: 8, warmth: 14, blacks: -4 };
  }
  if (seed.includes("cool")) {
    return { exposure: 3, brightness: 2, contrast: 8, saturation: -8, warmth: -12, blacks: 6 };
  }
  return { exposure: 6, brightness: 5, contrast: 7, saturation: 6, warmth: 2, blacks: 2 };
}

export function mockGeneratedImage(inputImage: string, label: string) {
  const safeLabel = label.replace(/[<>&"]/g, "");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs>
        <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
      </defs>
      <rect width="1200" height="900" fill="#141414"/>
      <image href="${inputImage}" x="110" y="80" width="980" height="680" preserveAspectRatio="xMidYMid meet"/>
      <rect x="110" y="80" width="980" height="680" fill="rgba(20,20,20,0.18)"/>
      <rect x="0" y="750" width="1200" height="150" fill="#0f0f0f"/>
      <text x="600" y="825" fill="#f7f7f2" font-family="Arial, sans-serif" font-size="42" text-anchor="middle">${safeLabel}</text>
      <text x="600" y="870" fill="#a7f3d0" font-family="Arial, sans-serif" font-size="22" text-anchor="middle">Mock AI generated preview</text>
    </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function mockOutpaintImage(inputImage: string, cropBox: CropBox) {
  const width = Math.max(1, Math.round(cropBox.width));
  const height = Math.max(1, Math.round(cropBox.height));
  const safeImage = inputImage.replace(/"/g, "&quot;");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#20242c"/>
      <image href="${safeImage}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>
      <rect width="${width}" height="${height}" fill="none" stroke="#6ee7b7" stroke-width="12"/>
      <text x="${width / 2}" y="${height - 28}" fill="#f7f7f2" font-family="Arial, sans-serif" font-size="22" text-anchor="middle">Mock AI expanded blank crop area</text>
    </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
