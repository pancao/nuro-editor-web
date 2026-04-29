import type { EditorTool } from "@/lib/types";

export const editorTools: EditorTool[] = [
  {
    id: "light",
    label: "Light",
    icon: "sun",
    enabled: true,
    actions: [
      { id: "auto-exposure", label: "Auto Exposure", flow: "system-adjust", localOnly: true, icon: "wand-2" },
      { id: "auto-wb", label: "Auto WB", flow: "system-adjust", localOnly: true, icon: "droplets" },
      { id: "exposure", label: "Exposure", flow: "system-adjust", localOnly: true, icon: "sun" },
      { id: "brilliance", label: "Brilliance", flow: "system-adjust", localOnly: true, icon: "sparkles" },
      { id: "brightness", label: "Brightness", flow: "system-adjust", localOnly: true, icon: "sun-medium" },
      { id: "contrast", label: "Contrast", flow: "system-adjust", localOnly: true, icon: "contrast" },
      { id: "highlights", label: "Highlights", flow: "system-adjust", localOnly: true, icon: "sun-medium" },
      { id: "shadows", label: "Shadows", flow: "system-adjust", localOnly: true, icon: "moon" },
      { id: "black-point", label: "Black Point", flow: "system-adjust", localOnly: true, icon: "circle-dot" },
    ],
  },
  {
    id: "color",
    label: "Color",
    icon: "palette",
    enabled: true,
    actions: [
      { id: "saturation", label: "Saturation", flow: "system-adjust", localOnly: true, icon: "droplet" },
      { id: "vibrance", label: "Vibrance", flow: "system-adjust", localOnly: true, icon: "palette" },
      { id: "warmth", label: "Warmth", flow: "system-adjust", localOnly: true, icon: "thermometer" },
      { id: "tint", label: "Tint", flow: "system-adjust", localOnly: true, icon: "pipette" },
      { id: "color-brightness", label: "Brightness", flow: "system-adjust", localOnly: true, icon: "sun-medium" },
      { id: "color-contrast", label: "Contrast", flow: "system-adjust", localOnly: true, icon: "contrast" },
      {
        id: "filter",
        label: "Filter",
        flow: "ai-suggest-params",
        promptTemplateId: "color.filter.suggestions",
        requiresSuggestion: true,
        icon: "sliders-horizontal",
      },
      {
        id: "mono",
        label: "Mono",
        flow: "ai-suggest-generate",
        promptTemplateId: "color.mono.suggestions",
        requiresSuggestion: true,
        icon: "moon",
      },
      {
        id: "colorize",
        label: "Colorize",
        flow: "ai-suggest-generate",
        promptTemplateId: "color.colorize.suggestions",
        requiresSuggestion: true,
        icon: "brush",
      },
      {
        id: "customize",
        label: "Customize",
        flow: "ai-custom-generate",
        promptTemplateId: "color.custom.generate",
        requiresInput: true,
        icon: "wand-2",
      },
    ],
  },
  {
    id: "style",
    label: "Style",
    icon: "sparkles",
    enabled: true,
    actions: [
      {
        id: "default",
        label: "Style",
        flow: "ai-suggest-generate",
        promptTemplateId: "style.default.suggestions",
        requiresSuggestion: true,
        icon: "sparkles",
      },
    ],
  },
  {
    id: "crop",
    label: "Crop",
    icon: "crop",
    enabled: true,
    actions: [
      {
        id: "frame",
        label: "Frame",
        flow: "crop-or-outpaint",
        promptTemplateId: "crop.outpaint.generate",
        icon: "crop",
      },
    ],
  },
  {
    id: "remove",
    label: "Remove",
    icon: "eraser",
    enabled: true,
    actions: [
      {
        id: "default",
        label: "Objects",
        flow: "ai-suggest-generate",
        promptTemplateId: "remove.default.suggestions",
        requiresSuggestion: true,
        icon: "eraser",
      },
      {
        id: "customize",
        label: "Customize",
        flow: "ai-custom-generate",
        promptTemplateId: "remove.custom.generate",
        requiresInput: true,
        icon: "wand-2",
      },
    ],
  },
  {
    id: "add",
    label: "Add",
    icon: "plus-circle",
    enabled: true,
    actions: [
      {
        id: "default",
        label: "Objects",
        flow: "ai-suggest-generate",
        promptTemplateId: "add.default.suggestions",
        requiresSuggestion: true,
        icon: "plus",
      },
      {
        id: "customize",
        label: "Customize",
        flow: "ai-custom-generate",
        promptTemplateId: "add.custom.generate",
        requiresInput: true,
        icon: "wand-2",
      },
    ],
  },
  {
    id: "change",
    label: "Change",
    icon: "replace",
    enabled: true,
    actions: [
      {
        id: "default",
        label: "Change",
        flow: "ai-suggest-generate",
        promptTemplateId: "change.default.suggestions",
        requiresSuggestion: true,
        icon: "replace",
      },
      {
        id: "customize",
        label: "Customize",
        flow: "ai-custom-generate",
        promptTemplateId: "change.custom.generate",
        requiresInput: true,
        icon: "wand-2",
      },
    ],
  },
  {
    id: "face",
    label: "Face",
    icon: "smile",
    enabled: true,
    actions: (
      [
        ["Expression", "smile"],
        ["Swap", "arrow-left-right"],
        ["Beauty", "sparkles"],
        ["Skin", "droplet"],
        ["Hair", "brush"],
        ["Angle", "rotate-cw"],
        ["Light", "sun"],
        ["Customize", "wand-2"],
        ["Pose", "person-standing"],
      ] as const
    ).map(([label, icon]) => ({
      id: label.toLowerCase(),
      label,
      flow: label === "Customize" ? "ai-custom-generate" : "ai-suggest-generate",
      promptTemplateId:
        label === "Customize" ? "face.custom.generate" : "face.default.suggestions",
      requiresSuggestion: label !== "Customize",
      requiresInput: label === "Customize",
      icon,
    })),
  },
  {
    id: "focus",
    label: "Focus",
    icon: "aperture",
    enabled: true,
    actions: [
      {
        id: "default",
        label: "Subject",
        flow: "ai-suggest-generate",
        promptTemplateId: "focus.default.suggestions",
        requiresSuggestion: true,
        icon: "aperture",
      },
      {
        id: "customize",
        label: "Customize",
        flow: "ai-custom-generate",
        promptTemplateId: "focus.custom.generate",
        requiresInput: true,
        icon: "wand-2",
      },
    ],
  },
  {
    id: "hd",
    label: "HD",
    icon: "scan",
    enabled: true,
    actions: [
      {
        id: "default",
        label: "Enhance",
        flow: "ai-suggest-generate",
        promptTemplateId: "hd.default.generate",
        icon: "sparkles",
      },
    ],
  },
  ...(["cloths", "time", "env", "shading", "create"] as const).map((id) => ({
    id,
    label: id[0].toUpperCase() + id.slice(1),
    icon: "circle",
    enabled: false,
    actions: [],
  })),
];

export const enabledTools = editorTools.filter((tool) => tool.enabled);

export function getTool(toolId: string) {
  return editorTools.find((tool) => tool.id === toolId);
}
