import { afterEach, describe, expect, it } from "vitest";
import { resolveAIProviderConfig } from "@/lib/ai/provider";

describe("AI provider config", () => {
  const previous = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_VISION_MODEL: process.env.AI_VISION_MODEL,
    AI_IMAGE_MODEL: process.env.AI_IMAGE_MODEL,
  };

  afterEach(() => {
    process.env.AI_PROVIDER = previous.AI_PROVIDER;
    process.env.AI_API_KEY = previous.AI_API_KEY;
    process.env.AI_BASE_URL = previous.AI_BASE_URL;
    process.env.AI_VISION_MODEL = previous.AI_VISION_MODEL;
    process.env.AI_IMAGE_MODEL = previous.AI_IMAGE_MODEL;
  });

  it("prioritizes browser settings over env and falls back per missing field", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "env-key";
    process.env.AI_BASE_URL = "https://env.example/v1";
    process.env.AI_VISION_MODEL = "env-vision";
    process.env.AI_IMAGE_MODEL = "env-image";

    expect(
      resolveAIProviderConfig({
        aiSettings: {
          provider: "cherryin",
          apiKey: "browser-key",
          imageModel: "browser-image",
        },
      }),
    ).toEqual({
      provider: "cherryin",
      apiKey: "browser-key",
      baseUrl: "https://env.example/v1",
      visionModel: "env-vision",
      imageModel: "browser-image",
    });
  });
});
