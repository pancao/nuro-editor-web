import type { AISettings } from "@/lib/types";

export const AI_SETTINGS_STORAGE_KEY = "nuro.ai-settings";

function trimSettings(settings: AISettings): AISettings {
  return {
    provider: settings.provider?.trim() || undefined,
    apiKey: settings.apiKey?.trim() || undefined,
    baseUrl: settings.baseUrl?.trim() || undefined,
    visionModel: settings.visionModel?.trim() || undefined,
    imageModel: settings.imageModel?.trim() || undefined,
  };
}

export function hasAISettings(settings: AISettings | null | undefined) {
  if (!settings) return false;
  const trimmed = trimSettings(settings);
  return Boolean(
    trimmed.provider ||
      trimmed.apiKey ||
      trimmed.baseUrl ||
      trimmed.visionModel ||
      trimmed.imageModel,
  );
}

export function loadBrowserAISettings(): AISettings | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AISettings;
    return hasAISettings(parsed) ? trimSettings(parsed) : null;
  } catch {
    return null;
  }
}

export function saveBrowserAISettings(settings: AISettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(trimSettings(settings)));
}

export function clearBrowserAISettings() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AI_SETTINGS_STORAGE_KEY);
}

export function withBrowserAISettings<T extends Record<string, unknown>>(payload: T): T & { aiSettings?: AISettings } {
  const settings = loadBrowserAISettings();
  if (!settings) return payload;
  return { ...payload, aiSettings: settings };
}

export function maskApiKey(apiKey?: string) {
  if (!apiKey) return undefined;
  if (apiKey.length <= 8) return "••••";
  return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`;
}

export function maskAISettings(settings: AISettings | null | undefined): AISettings | null {
  if (!settings || !hasAISettings(settings)) return null;
  const trimmed = trimSettings(settings);
  return {
    ...trimmed,
    apiKey: maskApiKey(trimmed.apiKey),
  };
}
