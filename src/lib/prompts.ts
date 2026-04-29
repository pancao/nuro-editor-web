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
    "Analyze {{imageDescription}}. Suggest concise parameter-based color filters for {{toolCategory}}/{{subTool}} in {{language}}.",
  ),
  template(
    "color.mono.suggestions",
    "color",
    "Mono style suggestions",
    "suggestions",
    "Analyze {{imageDescription}}. Suggest monochrome transformations, including street, high contrast, and soft grayscale looks.",
  ),
  template(
    "color.colorize.suggestions",
    "color",
    "Colorize suggestions",
    "suggestions",
    "If the image appears monochrome, suggest realistic colorization directions. Keep suggestions safe and photo-preserving.",
  ),
  template(
    "color.custom.generate",
    "color",
    "Color custom generation",
    "custom",
    "Apply the user's Color tool request to the photo: {{userInput}}. Preserve identity and composition.",
  ),
  template(
    "style.default.suggestions",
    "style",
    "Style suggestions",
    "suggestions",
    "Suggest useful style transformations for {{imageDescription}}, mixing user-ready options like comic, sketch, Polaroid, toy, and Memoji-inspired looks.",
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
