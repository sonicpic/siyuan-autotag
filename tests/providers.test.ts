import { describe, expect, it } from "vitest";
import { getProviderAdapter } from "../src/core/providers";
import { DEFAULT_SETTINGS, PROVIDER_PRESETS, applyProviderPreset, normalizeSettings } from "../src/core/settings";

describe("provider adapters", () => {
  it("builds an OpenAI-compatible forward proxy request", () => {
    const adapter = getProviderAdapter("openrouter");
    const request = adapter.buildRequest({
      settings: {
        ...DEFAULT_SETTINGS,
        provider: "openrouter",
        baseUrl: PROVIDER_PRESETS.openrouter.baseUrl,
        model: PROVIDER_PRESETS.openrouter.model,
        apiKey: "secret",
      },
      messages: [
        {
          role: "system",
          content: "test",
        },
      ],
    });

    expect(request.headers[0].Authorization).toBe("Bearer secret");
    expect(request.payload.model).toBe(PROVIDER_PRESETS.openrouter.model);
    expect(request.url).toBe(PROVIDER_PRESETS.openrouter.baseUrl);
    expect(request.payloadEncoding).toBe("json");
  });

  it("keeps supported provider presets when normalizing settings", () => {
    const settings = normalizeSettings({
      provider: "qwen",
    });

    expect(settings.provider).toBe("qwen");
    expect(settings.baseUrl).toBe(PROVIDER_PRESETS.qwen.baseUrl);
    expect(settings.model).toBe(PROVIDER_PRESETS.qwen.model);
  });

  it("applies provider presets without discarding other settings", () => {
    const settings = applyProviderPreset({
      ...DEFAULT_SETTINGS,
      apiKey: "secret",
      promptSuffix: "be precise",
    }, "moonshot");

    expect(settings.provider).toBe("moonshot");
    expect(settings.baseUrl).toBe(PROVIDER_PRESETS.moonshot.baseUrl);
    expect(settings.model).toBe(PROVIDER_PRESETS.moonshot.model);
    expect(settings.apiKey).toBe("secret");
    expect(settings.promptSuffix).toBe("be precise");
  });

  it("parses JSON content from an OpenAI-compatible response", () => {
    const adapter = getProviderAdapter("glm");
    const parsed = adapter.parseResponse({
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: "{\"labels\":[\"math/algebra\"],\"alternatives\":[\"math/geometry\"],\"ranked_candidates\":[{\"label\":\"math/algebra\",\"selected\":true,\"reason\":\"core topic\"},{\"label\":\"math/geometry\",\"selected\":false,\"reason\":\"secondary topic\"}],\"reason\":\"matched\"}",
            },
          },
        ],
      }),
      bodyEncoding: "text",
      contentType: "application/json",
      elapsed: 100,
      headers: {},
      status: 200,
      url: "https://example.com",
    });

    expect(parsed.labels).toEqual(["math/algebra"]);
    expect(parsed.alternatives).toEqual(["math/geometry"]);
    expect(parsed.rankedCandidates).toEqual([
      { label: "math/algebra", selected: true, reason: "core topic" },
      { label: "math/geometry", selected: false, reason: "secondary topic" },
    ]);
    expect(parsed.reason).toBe("matched");
  });
});
