import type { PromptTemplate, ToolId } from "@/lib/types";

const baseVariables = [
  "imageDescription",
  "toolCategory",
  "subTool",
  "userInput",
  "currentParams",
  "cropBox",
  "language",
];

function template(
  id: string,
  toolId: ToolId,
  title: string,
  capability: PromptTemplate["capability"],
  body: string,
): PromptTemplate {
  return {
    id,
    toolId,
    capability,
    title,
    template: body.trim(),
    variables: baseVariables,
  };
}

export const promptTemplates: PromptTemplate[] = [
  template(
    "color.filter.suggestions",
    "color",
    "Color filter suggestions",
    "suggestions",
    `You are a senior colorist suggesting bold, identifiable color grades for the photo shown.

DO NOT return generic adjectives like "warm", "vibrant", "moody". Every suggestion must reference a real cinematic / film-stock / photographer / era touchstone, and the prompt field must describe specific tonal behavior an image-generation model can execute (color casts in shadow/mid/highlight, contrast curve, saturation behavior, optional grain).

Mix the 5 options across these buckets — pick whichever buckets best fit the image:

1. Cinematic looks (name a film, director, or DP)
   Examples: "Blade Runner 2049 — teal-amber duality, crushed blacks", "Wong Kar-wai (In the Mood for Love) — jade greens + rust, lifted blacks", "Roger Deakins natural — neutral mids, gentle warm highlights", "A24 muted — desaturated blues, soft skin"

2. Film stock emulations (name the stock + signature traits)
   Examples: "Kodak Portra 400 — pastel skin, creamy highlights, soft greens", "Fuji Velvia 50 — punchy saturated greens & magentas, deep shadows", "Cinestill 800T — tungsten-balanced cyan shadows, neon halation", "Kodak Gold 200 — warm golden-hour tilt, low contrast"

3. Photographer-inspired palettes
   Examples: "Saul Leiter — saturated reds + rainy-window softness", "Alex Webb — chromatic tension, hard shadows", "William Eggleston — democratic everyday color, warm midtones", "Gregory Crewdson — cool dusk blues, faint warm window light"

4. Editorial / era
   Examples: "Y2K 2003 magazine — cyan tint, blown highlights, light grain", "70s Polaroid SX-70 — orange-pink shift, low contrast, dust", "90s point-and-shoot flash — green cast in shadows", "1950s Technicolor — saturated primaries"

Tailor to what the image actually shows — portraits favor Portra / Leibovitz palettes, landscapes favor Velvia / cinematic grades, urban scenes favor Cinestill / Saul Leiter, etc. Avoid duplicates and avoid suggestions that fight the subject.`,
  ),
  template(
    "color.mono.suggestions",
    "color",
    "Mono style suggestions",
    "suggestions",
    `You are a black-and-white photographer suggesting 5 monochrome conversions for the photo shown.

DO NOT return generic phrases like "high contrast B&W". Every option must reference a real film stock / photographer / darkroom process, and the prompt field must specify the tonal curve, grain character, and any toning a generation model should apply.

Mix across these buckets:

1. Classic film stocks
   Examples: "Ilford HP5 Plus 400 — punchy midtones, visible silver grain", "Kodak Tri-X 400 — gritty newsprint, deep blacks", "Ilford Delta 3200 — heavy grain, low-light glow", "Kodak T-Max 100 — fine-grain studio cleanliness", "Adox CMS 20 — micro-grain ultra-resolution"

2. Photographer signatures
   Examples: "Henri Cartier-Bresson — gentle midtones, decisive-moment crispness", "Sebastião Salgado — deep shadows + smoky highlights, almost printed", "Daido Moriyama — high-contrast are-bure-boke street", "Sally Mann — wet-plate softness with milky highlights", "Vivian Maier — soft midtones, square framing feel"

3. Process / darkroom looks
   Examples: "platinum print — extended tonal range, warm-neutral blacks", "lith print — soft highlights with warm-orange shadows", "infrared B&W — glowing foliage, dark skies, halation", "selenium-toned — cool deep blacks, slight purple cast", "split-toned — sepia highlights + selenium shadows"

4. Subject-specific
   Pick one option that flatters this image's subject (portrait soft-glow, street high-contrast, landscape long-tonal-range).

Avoid vague language. Each prompt should let an image model reproduce the look from text alone.`,
  ),
  template(
    "color.colorize.suggestions",
    "color",
    "Colorize suggestions",
    "suggestions",
    `The provided image appears black-and-white (or near-monochrome). Suggest 5 historically-grounded colorization directions — NOT generic "add natural color".

Mix:

1. Period-correct film palettes (match what color film of the apparent era would have rendered)
   Examples: "1970s Kodachrome — punchy reds, muted blues, slightly warm", "1950s Technicolor — saturated primaries, glowing skin", "early autochrome — pastel + soft cyan shadows", "1990s drugstore C-41 — warm cast, slight green shadows"

2. Photographer references for the era / subject
   Examples: "William Eggleston — democratic suburban color, warm everyday", "Stephen Shore — large-format sun-baked Americana", "Saul Leiter — saturated street with rainy softness", "Joel Meyerowitz — Cape Cod golden-hour pastels"

3. One conservative documentary-realistic colorization — accurate skin tones, natural sky and foliage, neutral whites.

Every prompt MUST specify ranges for skin tones, sky, foliage, fabrics, and lighting temperature so the colorization is grounded — not "make it colorful". Preserve composition exactly.`,
  ),
  template(
    "color.custom.generate",
    "color",
    "Color custom generation",
    "custom",
    "Apply the user's Color tool request to the photo: {{userInput}}. Preserve identity, composition, and detail. Translate the request into specific tonal/saturation/contrast moves rather than blanket filters.",
  ),
  template(
    "style.default.suggestions",
    "style",
    "Style suggestions",
    "suggestions",
    `You are an art director suggesting 5 bold visual style transformations for the photo shown.

DO NOT return generic genres like "comic" or "watercolor" alone. Every suggestion must reference a real film, photographer, illustration tradition, or camera/film look, and the prompt field must describe the palette, edge treatment, texture, grain, and light quality clearly enough for an image-generation model to reproduce it. Identity, pose, and composition MUST be preserved.

Mix across these buckets — pick the ones that best fit the image:

1. Cinematic / movie-inspired
   Examples: "Wes Anderson — symmetric pastel diorama, centered framing, milky highlights", "Studio Ghibli — hand-painted background, soft watercolor sky, gentle line", "Blade Runner 2049 — sodium-orange dystopia, atmospheric haze, deep teal shadows", "Dune: Part Two — desert monochromatic, dust grain, high-key sand", "Amélie — cross-processed greens & reds, warm Paris dusk"

2. Photographer signatures
   Examples: "Annie Leibovitz — polished editorial portrait, dramatic key light, dark backdrop", "Tim Walker — whimsical fantasy with oversized props and soft daylight", "Helmut Newton — high-contrast B&W glamour, hard shadows", "Nan Goldin — diaristic flash, intimate snapshot energy", "Wolfgang Tillmans — natural quotidian, faded color"

3. Camera / film looks
   Examples: "Polaroid SX-70 Time-Zero — square frame, milky highlights, slight chemical shift", "Lomography fish-eye — saturated colors, vignette, distortion", "Leica Q3 monochrome — milky highlights, smooth tonal roll-off", "disposable single-use camera — flash-blown subject, dim background", "8mm home movie — grain + flicker + faded reds"

4. Illustration / graphic
   Examples: "Studio Ghibli watercolor", "Moebius eurocomic — clean line + flat saturated color", "Risograph 2-color print — fluorescent pink + teal misregistration", "Japanese ukiyo-e woodblock — flat color planes, outlined contours", "Saul Bass mid-century poster — bold geometric shapes"

5. Era / subculture
   Examples: "1990s skater Polaroid", "Y2K MTV — chrome bevels, lens flares, neon", "VHS tracking error — chromatic tearing, scan lines", "1970s travel poster lithograph — flat color planes, ink texture", "80s synthwave — magenta-cyan grid, lens haze"

Pick 5 options that best suit this image. Portraits → photographer/film stocks; landscapes → film stocks/cinematic; still-life or street → illustration/era. Avoid duplicates within and across buckets.`,
  ),
  template(
    "crop.outpaint.generate",
    "crop",
    "Crop outpaint",
    "outpaint",
    "Fill only the blank or transparent areas of the supplied target-size image. Preserve existing pixels exactly and return an image with the same dimensions as the input guide.",
  ),
  template(
    "remove.default.suggestions",
    "remove",
    "Removable object suggestions",
    "suggestions",
    "List removable distractions in {{imageDescription}}, including visible watermarks, reflections, clutter, or unwanted objects.",
  ),
  template(
    "remove.custom.generate",
    "remove",
    "Remove custom generation",
    "custom",
    "Remove only this user-specified target: {{userInput}}. Fill the background naturally.",
  ),
  template(
    "add.default.suggestions",
    "add",
    "Add object suggestions",
    "suggestions",
    "Suggest creative objects that could be added naturally to {{imageDescription}} without changing the core subject.",
  ),
  template(
    "add.custom.generate",
    "add",
    "Add custom generation",
    "custom",
    "Add the user's requested object: {{userInput}}. Match scale, perspective, and lighting.",
  ),
  template(
    "change.default.suggestions",
    "change",
    "Change suggestions",
    "suggestions",
    "Suggest plausible edits for {{imageDescription}}, such as subject orientation, angle, background mood, or composition changes.",
  ),
  template(
    "change.custom.generate",
    "change",
    "Change custom generation",
    "custom",
    "Change the image according to the user's request: {{userInput}}. Preserve the important subject identity.",
  ),
  template(
    "face.default.suggestions",
    "face",
    "Face suggestions",
    "suggestions",
    "Suggest face edits for {{subTool}} in {{imageDescription}}. Keep suggestions realistic and identity-preserving.",
  ),
  template(
    "face.custom.generate",
    "face",
    "Face custom generation",
    "custom",
    "Apply this Face tool request: {{userInput}}. Preserve person identity and avoid unrealistic artifacts.",
  ),
  template(
    "focus.default.suggestions",
    "focus",
    "Focus suggestions",
    "suggestions",
    "Identify subjects or objects in {{imageDescription}} that would be useful focus targets.",
  ),
  template(
    "focus.custom.generate",
    "focus",
    "Focus custom generation",
    "custom",
    "Shift focus according to the user's request: {{userInput}}. Keep composition natural.",
  ),
  template(
    "hd.default.generate",
    "hd",
    "HD enhancement",
    "generate",
    "Enhance details, reduce noise, and improve clarity while keeping the photo natural.",
  ),
];

export function getPromptTemplate(id?: string) {
  return promptTemplates.find((prompt) => prompt.id === id);
}
