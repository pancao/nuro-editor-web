export type ToolFlow =
  | "system-adjust"
  | "ai-suggest-params"
  | "ai-suggest-generate"
  | "ai-custom-generate"
  | "crop-or-outpaint";

export type ToolId =
  | "light"
  | "color"
  | "style"
  | "crop"
  | "remove"
  | "add"
  | "change"
  | "face"
  | "focus"
  | "hd"
  | "cloths"
  | "time"
  | "env"
  | "shading"
  | "create";

export type PromptCapability =
  | "suggestions"
  | "params"
  | "generate"
  | "outpaint"
  | "custom";

export type AdjustmentParams = {
  exposure?: number;
  highlights?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  vibrance?: number;
  shadows?: number;
  warmth?: number;
  tint?: number;
  blacks?: number;
  brilliance?: number;
};

export type ToolAction = {
  id: string;
  label: string;
  flow: ToolFlow;
  icon?: string;
  promptTemplateId?: string;
  requiresSuggestion?: boolean;
  requiresInput?: boolean;
  localOnly?: boolean;
};

export type EditorTool = {
  id: ToolId;
  label: string;
  icon: string;
  enabled: boolean;
  actions: ToolAction[];
};

export type AISuggestion = {
  id: string;
  label: string;
  prompt: string;
  description?: string;
};

export type AISettings = {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  visionModel?: string;
  imageModel?: string;
};

export type SuggestionTarget = {
  toolId: ToolId;
  actionId: string;
  label: string;
  flow: ToolFlow;
};

export type SuggestionGroup = {
  toolId: ToolId;
  actionId: string;
  suggestions: AISuggestion[];
};

export type ImageAsset = {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  createdAt: string;
};

export type EditOperation = {
  id: string;
  toolId: ToolId;
  actionId: string;
  label: string;
  image: ImageAsset;
  sourceRect?: CropBox;
  params?: AdjustmentParams;
  createdAt: string;
};

export type GenerationJob = {
  status: "idle" | "loading" | "success" | "error";
  message?: string;
};

export type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PromptTemplate = {
  id: string;
  toolId: ToolId;
  capability: PromptCapability;
  title: string;
  template: string;
  variables: string[];
};
