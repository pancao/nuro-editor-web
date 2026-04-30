import { mockGeneratedImage, mockOutpaintImage, mockParams, mockSuggestions } from "@/lib/ai/mock-provider";
import { getPromptTemplate, promptTemplates } from "@/lib/prompts";
import { editorTools } from "@/lib/tools";
import type {
  AdjustmentParams,
  AISettings,
  AISuggestion,
  CropBox,
  SuggestionGroup,
  SuggestionTarget,
  ToolId,
} from "@/lib/types";

/**
 * Look up the prompt template body for a given (toolId, actionId), if one is
 * configured in the tool catalog. Used to inject the rich creative direction
 * into the system/user prompt for AI suggestion calls — without this the model
 * only sees "Tool: color, Action: filter" and returns generic suggestions.
 */
function templateBodyForAction(toolId: ToolId, actionId: string | undefined): string | undefined {
  const tool = editorTools.find((t) => t.id === toolId);
  if (!tool) return undefined;
  const action = tool.actions.find((a) => a.id === actionId);
  const id = action?.promptTemplateId;
  if (!id) return undefined;
  return getPromptTemplate(id)?.template;
}

/**
 * The full library of suggestion-capability prompt bodies, formatted as one
 * stable string. Used as the system prompt for batch suggestion calls so the
 * provider's prefix cache can hit on every batch regardless of which targets
 * appear. Sorted by id for byte-stability.
 */
const ALL_SUGGESTION_TEMPLATES_SYSTEM_PROMPT = (() => {
  const bodies = promptTemplates
    .filter((t) => t.capability === "suggestions")
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((t) => `=== ${t.id} ===\n${t.template}`);
  return [
    "You are an AI photo editing assistant. Return only valid JSON. Do not include markdown fences.",
    "",
    "Below is the full library of creative directions, keyed by promptTemplateId. For each batch request you'll be told which (toolId, actionId) targets to address — match each target to the matching templateId and follow that section's direction.",
    "",
    bodies.join("\n\n"),
  ].join("\n");
})();

type BasePayload = {
  image?: string;
  aiSettings?: AISettings;
  toolId: ToolId;
  actionId?: string;
  prompt?: string;
  selection?: AISuggestion;
  cropBox?: CropBox;
  context?: Record<string, unknown>;
};

type BatchSuggestionsPayload = {
  image?: string;
  aiSettings?: AISettings;
  targets: SuggestionTarget[];
  context?: Record<string, unknown>;
};

type OpenAICompatibleMessage = {
  role: "system" | "user";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

type UnknownRecord = Record<string, unknown>;

function isOpenAICompatibleProvider(provider: string | undefined, baseUrl: string) {
  const normalized = provider?.toLowerCase();
  return normalized === "openai" || normalized === "cherryin" || baseUrl.includes("cherryin");
}

function cleanSetting(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * In production, the server-side env-var fallback is intentionally disabled —
 * users must supply their own provider via browser settings (the same flow the
 * Prompt Lab uses to populate `aiSettings`). This keeps server-funded AI usage
 * out of the public deployment. In development, env vars still act as a
 * convenience fallback so contributors don't need to configure the panel for
 * every fresh checkout.
 */
function envFallback(envName: string): string | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  return cleanSetting(process.env[envName]);
}

export function resolveAIProviderConfig(payload: { aiSettings?: AISettings }) {
  const settings = payload.aiSettings;
  return {
    provider: cleanSetting(settings?.provider) ?? envFallback("AI_PROVIDER"),
    apiKey: cleanSetting(settings?.apiKey) ?? envFallback("AI_API_KEY"),
    baseUrl: cleanSetting(settings?.baseUrl) ?? envFallback("AI_BASE_URL"),
    visionModel: cleanSetting(settings?.visionModel) ?? envFallback("AI_VISION_MODEL"),
    imageModel: cleanSetting(settings?.imageModel) ?? envFallback("AI_IMAGE_MODEL"),
  };
}

/**
 * Walk the string starting at `start` and return the index of the closing `}`
 * that matches the opening `{` at `start`. Handles strings (with escapes) so
 * braces inside string literals don't affect depth. Returns -1 if no match.
 */
function findMatchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseJsonObject<T>(content: string): T {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // 1) Direct parse — works when the response is clean JSON.
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through
  }

  // 2) Find the first balanced {...} block. This handles LLMs that emit
  //    trailing commentary, a second JSON object, or other noise after the
  //    intended payload (e.g. "Unexpected non-whitespace character after JSON").
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace >= 0) {
    const matchingEnd = findMatchingBrace(cleaned, firstBrace);
    if (matchingEnd > firstBrace) {
      const candidate = cleaned.slice(firstBrace, matchingEnd + 1);
      try {
        return JSON.parse(candidate) as T;
      } catch {
        // fall through
      }
    }

    // 3) Last-ditch: greedy first-brace to last-brace. Some responses have
    //    quoted prose mixed in, where the balanced extractor stops too early.
    const lastBrace = cleaned.lastIndexOf("}");
    if (lastBrace > firstBrace) {
      const greedy = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(greedy) as T;
      } catch (greedyError) {
        const reason = greedyError instanceof Error ? greedyError.message : "invalid JSON";
        throw new Error(`AI response JSON was malformed: ${reason}`);
      }
    }
  }

  throw new Error("AI response did not contain JSON");
}

function normalizeSuggestionList(toolId: ToolId, suggestions: unknown): AISuggestion[] {
  const parsed = Array.isArray(suggestions)
    ? suggestions
        .map((item, index) => {
          if (!item || typeof item !== "object") return null;
          const record = item as UnknownRecord;
          const label = typeof record.label === "string" ? record.label : `Option ${index + 1}`;
          const prompt =
            typeof record.prompt === "string"
              ? record.prompt
              : typeof record.description === "string"
                ? record.description
                : label;
          const suggestion: AISuggestion = {
            id: typeof record.id === "string" ? record.id : `${toolId}-${index + 1}`,
            label,
            prompt,
          };
          if (typeof record.description === "string") suggestion.description = record.description;
          return suggestion;
        })
        .filter((item): item is AISuggestion => Boolean(item))
    : [];
  const fallback = mockSuggestions(toolId);
  const merged = [...parsed, ...fallback.filter((item) => !parsed.some((existing) => existing.id === item.id))];
  return merged.slice(0, 5);
}

function normalizeBatchSuggestions(payload: BatchSuggestionsPayload, groups: unknown): { groups: SuggestionGroup[] } {
  const parsedGroups = Array.isArray(groups) ? groups : [];
  return {
    groups: payload.targets.map((target) => {
      const group = parsedGroups.find((item) => {
        if (!item || typeof item !== "object") return false;
        const record = item as UnknownRecord;
        return record.toolId === target.toolId && record.actionId === target.actionId;
      }) as UnknownRecord | undefined;
      return {
        toolId: target.toolId,
        actionId: target.actionId,
        suggestions: normalizeSuggestionList(target.toolId, group?.suggestions),
      };
    }),
  };
}

function findImageInValue(value: unknown): string | null {
  if (typeof value === "string") {
    const dataUrl = value.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=_-]+/);
    if (dataUrl) return dataUrl[0];

    const markdownImage = value.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/);
    if (markdownImage) return markdownImage[1];

    const imageUrl = value.match(/https?:\/\/[^\s")]+?\.(?:png|jpe?g|webp|gif)(?:\?[^\s")]*)?/i);
    if (imageUrl) return imageUrl[0];
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const image = findImageInValue(item);
      if (image) return image;
    }
    return null;
  }

  if (value && typeof value === "object") {
    const record = value as UnknownRecord;
    for (const key of ["image", "url", "image_url", "b64_json", "base64", "data"]) {
      const candidate = record[key];
      if (typeof candidate === "string") {
        if (key === "b64_json" || key === "base64") {
          return `data:image/png;base64,${candidate}`;
        }
        const image = findImageInValue(candidate);
        if (image) return image;
      }
      if (candidate && typeof candidate === "object") {
        const image = findImageInValue(candidate);
        if (image) return image;
      }
    }

    for (const candidate of Object.values(record)) {
      const image = findImageInValue(candidate);
      if (image) return image;
    }
  }

  return null;
}

async function callOpenAICompatibleJson<T>(
  operation: "suggestions" | "params",
  payload: BasePayload,
): Promise<T> {
  const config = resolveAIProviderConfig(payload);
  const baseUrl = config.baseUrl;
  const apiKey = config.apiKey;
  const model = config.visionModel || config.imageModel;

  if (!baseUrl || !apiKey || !model) {
    throw new Error("AI_BASE_URL, AI_API_KEY, and AI_VISION_MODEL are required");
  }

  const templateBody =
    operation === "suggestions" ? templateBodyForAction(payload.toolId, payload.actionId) : undefined;

  // System prompt holds the static "creative direction" so providers with
  // automatic prefix caching (OpenAI, Anthropic, Gemini) get a cache hit on
  // the 2nd call onward for the same (toolId, actionId). Keep this prefix
  // strictly stable — anything dynamic (toolId, image) goes in the user msg.
  const systemPrompt =
    operation === "suggestions" && templateBody
      ? `You are an AI photo editing assistant. Return only valid JSON. Do not include markdown fences.\n\n=== Creative direction ===\n${templateBody}`
      : "You are an AI photo editing assistant. Return only valid JSON. Do not include markdown fences.";

  const userText =
    operation === "suggestions"
      ? [
          `Tool: ${payload.toolId}`,
          `Action: ${payload.actionId ?? "default"}`,
          "Return exactly 5 photo editing suggestions following the creative direction in the system prompt.",
          "Each `label` is a short Chinese-or-English headline (≤24 chars).",
          "Each `prompt` is a fully-formed instruction for an image-generation model — specific colors, contrast, grain, references — never a single adjective.",
          "Return minified JSON only, with no markdown and no trailing commentary.",
          "JSON shape: {\"suggestions\":[{\"id\":\"short-id\",\"label\":\"Short label\",\"prompt\":\"actionable edit prompt\"}]}",
        ].join("\n")
      : [
          `Tool: ${payload.toolId}`,
          `Action: ${payload.actionId ?? "default"}`,
          `Selected suggestion: ${payload.selection?.label ?? "custom"}`,
          `Suggestion prompt: ${payload.selection?.prompt ?? payload.prompt ?? ""}`,
          "Return local adjustment parameters between -30 and 30.",
          "JSON shape: {\"params\":{\"exposure\":0,\"brightness\":0,\"contrast\":0,\"saturation\":0,\"warmth\":0,\"blacks\":0}}",
        ].join("\n");

  const messages: OpenAICompatibleMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: payload.image
        ? [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: payload.image } },
          ]
        : userText,
    },
  ];

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      // Suggestions need higher creativity to surface diverse film/photographer
      // references; param mapping wants determinism.
      temperature: operation === "suggestions" ? 0.85 : 0.3,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body?.error?.message ?? body?.message ?? response.statusText;
    throw new Error(`OpenAI-compatible ${operation} failed: ${response.status} ${detail}`);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI-compatible response did not include message content");
  }

  return parseJsonObject<T>(content);
}

async function callOpenAICompatibleBatchSuggestions(payload: BatchSuggestionsPayload) {
  const config = resolveAIProviderConfig(payload);
  const baseUrl = config.baseUrl;
  const apiKey = config.apiKey;
  const model = config.visionModel || config.imageModel;

  if (!baseUrl || !apiKey || !model) {
    throw new Error("AI_BASE_URL, AI_API_KEY, and AI_VISION_MODEL are required");
  }

  // Resolve each target to its templateId so the user prompt is short and the
  // big creative direction stays in the cacheable system prompt.
  const targetEntries = payload.targets.map((target) => {
    const tool = editorTools.find((t) => t.id === target.toolId);
    const action = tool?.actions.find((a) => a.id === target.actionId);
    return {
      toolId: target.toolId,
      actionId: target.actionId,
      label: target.label,
      promptTemplateId: action?.promptTemplateId,
    };
  });

  const userText = [
    "Return grouped photo editing suggestions for every target listed below.",
    "Each group must keep the same toolId and actionId.",
    "Return exactly 5 suggestions per target.",
    "Each `label` is a short headline (≤24 chars).",
    "Each `prompt` is a fully-formed instruction for an image-generation model — specific colors, contrast, grain, references — never a single adjective.",
    "Different targets must follow different sections of the creative direction in the system prompt. DO NOT reuse the same suggestions across targets.",
    "Return minified JSON only, with no markdown and no trailing commentary.",
    "",
    `Targets: ${JSON.stringify(targetEntries)}`,
    "",
    "JSON shape: {\"groups\":[{\"toolId\":\"style\",\"actionId\":\"default\",\"suggestions\":[{\"id\":\"short-id\",\"label\":\"Short label\",\"prompt\":\"actionable edit prompt\"}]}]}",
  ].join("\n");

  const messages: OpenAICompatibleMessage[] = [
    { role: "system", content: ALL_SUGGESTION_TEMPLATES_SYSTEM_PROMPT },
    {
      role: "user",
      content: payload.image
        ? [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: payload.image } },
          ]
        : userText,
    },
  ];

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      // Higher temperature so we get diverse film/photographer/era references
      // instead of safe-bet "warm and contrasty" suggestions.
      temperature: 0.85,
      max_tokens: 12000,
      response_format: { type: "json_object" },
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body?.error?.message ?? body?.message ?? response.statusText;
    throw new Error(`OpenAI-compatible batch suggestions failed: ${response.status} ${detail}`);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI-compatible response did not include message content");
  }

  return parseJsonObject<{ groups: SuggestionGroup[] }>(content);
}

async function callOpenAICompatibleImage(payload: BasePayload, mode: "generate" | "outpaint") {
  const config = resolveAIProviderConfig(payload);
  const baseUrl = config.baseUrl;
  const apiKey = config.apiKey;
  const model = config.imageModel;

  if (!baseUrl || !apiKey || !model) {
    throw new Error("AI_BASE_URL, AI_API_KEY, and AI_IMAGE_MODEL are required");
  }

  const editPrompt =
    mode === "outpaint"
      ? [
          "Fill only the transparent or blank areas of the supplied image.",
          "The supplied image is already the user's requested final canvas size.",
          `Required final size: ${JSON.stringify(payload.context?.guideImage ?? payload.cropBox)}`,
          "Do not crop, resize, reposition, repaint, or reinterpret the existing non-empty image content.",
          "Only synthesize pixels in the empty regions so they naturally continue the photo.",
          "Return the edited image as an image output. If the API cannot attach binary image output, return JSON with an image data URL or image URL in the `image` field.",
        ].join("\n")
      : [
          "Edit the supplied image according to this instruction:",
          payload.selection?.prompt ?? payload.prompt ?? "Apply a natural photo edit.",
          `Tool: ${payload.toolId}`,
          `Action: ${payload.actionId ?? "default"}`,
          "Return the edited image as an image output. If the API cannot attach binary image output, return JSON with an image data URL or image URL in the `image` field.",
        ].join("\n");

  const messages: OpenAICompatibleMessage[] = [
    {
      role: "system",
      content:
        "You are an AI image editing model. Produce an edited image, not a text-only description.",
    },
    {
      role: "user",
      content: payload.image
        ? [
            { type: "text", text: editPrompt },
            { type: "image_url", image_url: { url: payload.image } },
          ]
        : editPrompt,
    },
  ];

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      modalities: ["text", "image"],
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body?.error?.message ?? body?.message ?? response.statusText;
    throw new Error(`OpenAI-compatible image ${mode} failed: ${response.status} ${detail}`);
  }

  const image = findImageInValue(body);
  if (!image) {
    throw new Error("Image model response did not include an image URL or base64 image");
  }

  return { image };
}

async function callConfiguredProvider<T>(operation: string, payload: BasePayload): Promise<T | null> {
  const config = resolveAIProviderConfig(payload);
  const baseUrl = config.baseUrl;
  const apiKey = config.apiKey;
  const provider = config.provider;

  if (!baseUrl || !apiKey || provider === "mock") {
    return null;
  }

  if (isOpenAICompatibleProvider(provider, baseUrl)) {
    if (operation === "suggestions" || operation === "params") {
      return callOpenAICompatibleJson<T>(operation, payload);
    }
    if (operation === "generate" || operation === "outpaint") {
      return (await callOpenAICompatibleImage(
        payload,
        operation === "outpaint" ? "outpaint" : "generate",
      )) as T;
    }

    return null;
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/${operation}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "x-ai-provider": provider ?? "custom",
    },
    body: JSON.stringify({
      ...payload,
      visionModel: config.visionModel,
      imageModel: config.imageModel,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI provider ${operation} failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getSuggestions(payload: BasePayload) {
  try {
    const configured = await callConfiguredProvider<{ suggestions: AISuggestion[] }>(
      "suggestions",
      payload,
    );
    if (!configured?.suggestions) {
      return {
        suggestions: normalizeSuggestionList(payload.toolId, mockSuggestions(payload.toolId)),
        usedMock: true,
        mockReason: "AI provider not configured (missing baseUrl/apiKey or provider=mock)",
      };
    }
    return {
      suggestions: normalizeSuggestionList(payload.toolId, configured.suggestions),
      usedMock: false,
    };
  } catch (error) {
    console.warn(error);
    return {
      suggestions: normalizeSuggestionList(payload.toolId, mockSuggestions(payload.toolId)),
      usedMock: true,
      mockReason: error instanceof Error ? error.message : "Unknown provider error",
    };
  }
}

export async function getBatchSuggestions(payload: BatchSuggestionsPayload) {
  const config = resolveAIProviderConfig(payload);
  const baseUrl = config.baseUrl;
  const apiKey = config.apiKey;
  const provider = config.provider;

  if (baseUrl && apiKey && provider !== "mock" && isOpenAICompatibleProvider(provider, baseUrl)) {
    try {
      const response = await callOpenAICompatibleBatchSuggestions(payload);
      return { ...normalizeBatchSuggestions(payload, response.groups), usedMock: false };
    } catch (error) {
      console.warn(error);
      return {
        ...normalizeBatchSuggestions(payload, []),
        usedMock: true,
        mockReason: error instanceof Error ? error.message : "Unknown provider error",
      };
    }
  }

  if (baseUrl && apiKey && provider !== "mock") {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/suggestions/batch`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "x-ai-provider": provider ?? "custom",
        },
        body: JSON.stringify({
          ...payload,
          visionModel: config.visionModel,
          imageModel: config.imageModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI provider batch suggestions failed: ${response.status}`);
      }

      return {
        ...normalizeBatchSuggestions(payload, ((await response.json()) as { groups: SuggestionGroup[] }).groups),
        usedMock: false,
      };
    } catch (error) {
      console.warn(error);
      return {
        ...normalizeBatchSuggestions(payload, []),
        usedMock: true,
        mockReason: error instanceof Error ? error.message : "Unknown provider error",
      };
    }
  }

  return {
    ...normalizeBatchSuggestions(payload, []),
    usedMock: true,
    mockReason: "AI provider not configured (missing baseUrl/apiKey or provider=mock)",
  };
}

export async function getSceneInfo(payload: { image?: string; aiSettings?: AISettings }) {
  const config = resolveAIProviderConfig(payload);
  const baseUrl = config.baseUrl;
  const apiKey = config.apiKey;
  const provider = config.provider;
  const model = config.visionModel || config.imageModel;

  if (!payload.image) return { hasPeople: false };
  if (!baseUrl || !apiKey || provider === "mock" || !model) {
    return { hasPeople: true };
  }
  if (!isOpenAICompatibleProvider(provider, baseUrl)) {
    return { hasPeople: true };
  }

  const userText = [
    "Look at the supplied image and decide whether at least one human person, face, or recognizable human body part is visible.",
    "Statues, paintings, and obvious cartoon mascots without realistic human features do NOT count as people.",
    "Return minified JSON only. JSON shape: {\"hasPeople\": true | false}.",
  ].join("\n");

  const messages: OpenAICompatibleMessage[] = [
    {
      role: "system",
      content:
        "You classify photographs. Return only valid JSON. Do not include markdown fences or commentary.",
    },
    {
      role: "user",
      content: [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: payload.image } },
      ],
    },
  ];

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: 64,
        response_format: { type: "json_object" },
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error?.message ?? body?.message ?? response.statusText);
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return { hasPeople: true };
    }
    const parsed = parseJsonObject<{ hasPeople?: unknown }>(content);
    return { hasPeople: parsed.hasPeople === true };
  } catch (error) {
    console.warn(error);
    return { hasPeople: true };
  }
}

export async function getParams(payload: BasePayload) {
  try {
    const configured = await callConfiguredProvider<{ params: AdjustmentParams }>(
      "params",
      payload,
    );
    if (!configured) {
      return {
        params: mockParams(payload.selection?.prompt ?? payload.prompt ?? ""),
        usedMock: true,
        mockReason: "AI provider not configured (missing baseUrl/apiKey or provider=mock)",
      };
    }
    return { ...configured, usedMock: false };
  } catch (error) {
    console.warn(error);
    return {
      params: mockParams(payload.selection?.prompt ?? payload.prompt ?? ""),
      usedMock: true,
      mockReason: error instanceof Error ? error.message : "Unknown provider error",
    };
  }
}

export async function generateImage(payload: BasePayload) {
  try {
    const configured = await callConfiguredProvider<{ image: string }>("generate", payload);
    const label = payload.selection?.label ?? payload.prompt ?? "AI Edit";
    if (!configured) {
      return {
        image: mockGeneratedImage(payload.image ?? "", label),
        usedMock: true,
        mockReason: "AI provider not configured (missing baseUrl/apiKey or provider=mock)",
      };
    }
    return { ...configured, usedMock: false };
  } catch (error) {
    console.warn(error);
    const label = payload.selection?.label ?? payload.prompt ?? "AI Edit";
    return {
      image: mockGeneratedImage(payload.image ?? "", label),
      usedMock: true,
      mockReason: error instanceof Error ? error.message : "Unknown provider error",
    };
  }
}

export async function outpaintImage(payload: BasePayload) {
  if (!payload.cropBox) {
    throw new Error("cropBox is required for outpaint");
  }
  try {
    const configured = await callConfiguredProvider<{ image: string }>("outpaint", payload);
    if (!configured) {
      return {
        image: mockOutpaintImage(payload.image ?? "", payload.cropBox),
        usedMock: true,
        mockReason: "AI provider not configured (missing baseUrl/apiKey or provider=mock)",
      };
    }
    return { ...configured, usedMock: false };
  } catch (error) {
    console.warn(error);
    return {
      image: mockOutpaintImage(payload.image ?? "", payload.cropBox),
      usedMock: true,
      mockReason: error instanceof Error ? error.message : "Unknown provider error",
    };
  }
}
