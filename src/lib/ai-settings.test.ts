import { afterEach, describe, expect, it } from "vitest";
import {
  AI_SETTINGS_STORAGE_KEY,
  clearBrowserAISettings,
  loadBrowserAISettings,
  maskAISettings,
  saveBrowserAISettings,
  withBrowserAISettings,
} from "@/lib/ai-settings";

describe("browser AI settings", () => {
  afterEach(() => {
    window.localStorage.removeItem(AI_SETTINGS_STORAGE_KEY);
  });

  it("saves, loads, injects, and clears browser settings", () => {
    saveBrowserAISettings({
      provider: " cherryin ",
      apiKey: " sk-test-123456 ",
      baseUrl: " https://open.cherryin.net/v1 ",
      visionModel: " google/gemini-3-flash-preview ",
      imageModel: " google/gemini-2.5-flash-image ",
    });

    expect(loadBrowserAISettings()).toEqual({
      provider: "cherryin",
      apiKey: "sk-test-123456",
      baseUrl: "https://open.cherryin.net/v1",
      visionModel: "google/gemini-3-flash-preview",
      imageModel: "google/gemini-2.5-flash-image",
    });
    expect(withBrowserAISettings({ toolId: "style" })).toMatchObject({
      aiSettings: { provider: "cherryin", apiKey: "sk-test-123456" },
    });

    clearBrowserAISettings();
    expect(loadBrowserAISettings()).toBeNull();
    expect(withBrowserAISettings({ toolId: "style" })).toEqual({ toolId: "style" });
  });

  it("masks API keys for display", () => {
    expect(maskAISettings({ provider: "cherryin", apiKey: "sk-abcdef123456" })).toEqual({
      provider: "cherryin",
      apiKey: "sk-a••••3456",
      baseUrl: undefined,
      visionModel: undefined,
      imageModel: undefined,
    });
  });
});
