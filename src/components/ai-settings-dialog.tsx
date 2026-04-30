"use client";

import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  clearBrowserAISettings,
  hasAISettings,
  loadBrowserAISettings,
  maskAISettings,
  saveBrowserAISettings,
} from "@/lib/ai-settings";
import type { AISettings } from "@/lib/types";

/**
 * Self-contained AI provider settings dialog. Owns its localStorage state so
 * it can be dropped into any host (the editor, the Prompt Lab, etc.) with no
 * extra plumbing. Toggle visibility via `open` / `onClose`.
 *
 * In production builds, AI requests don't fall back to env vars — users must
 * configure a provider here for real AI calls. The "Source" label reflects
 * that so it's clear what the server will see.
 */
export function AISettingsDialog({ onClose, open }: { onClose: () => void; open: boolean }) {
  const [settings, setSettings] = useState<AISettings>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setSettings(loadBrowserAISettings() ?? {});
      setSaved(false);
    }
  }, [open]);

  function updateSetting(key: keyof AISettings, value: string) {
    setSettings((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
  }

  function save() {
    saveBrowserAISettings(settings);
    setSettings(loadBrowserAISettings() ?? {});
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  function clear() {
    clearBrowserAISettings();
    setSettings({});
    setSaved(false);
  }

  if (!open) return null;

  const isProd = process.env.NODE_ENV === "production";
  const source = hasAISettings(settings)
    ? "Browser settings"
    : isProd
      ? "Not configured — AI calls will return mock data"
      : ".env fallback";
  const masked = maskAISettings(settings);

  return (
    <div className="fixed inset-0 z-[60] bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="ml-auto flex h-full w-full max-w-md flex-col rounded-xl border border-white/10 bg-[#17181c] shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-white">AI Settings</h2>
            <p className="text-xs text-white/50">Source: {source}</p>
          </div>
          <button
            aria-label="Close settings"
            className="grid size-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-4">
          {isProd ? (
            <div className="rounded-md border border-amber-300/40 bg-amber-300/10 p-3 text-xs text-amber-100">
              This is the production build. To make real AI calls you must
              supply your own provider credentials below — they are stored only
              in this browser&apos;s local storage and sent with each request.
            </div>
          ) : null}

          <SettingsField
            label="Provider"
            onChange={(value) => updateSetting("provider", value)}
            placeholder="cherryin or openai"
            value={settings.provider ?? ""}
          />
          <SettingsField
            label="Base URL"
            onChange={(value) => updateSetting("baseUrl", value)}
            placeholder="https://open.cherryin.net/v1"
            value={settings.baseUrl ?? ""}
          />
          <SettingsField
            label="API Key"
            onChange={(value) => updateSetting("apiKey", value)}
            placeholder="sk-..."
            type="password"
            value={settings.apiKey ?? ""}
          />
          <SettingsField
            label="Vision Model"
            onChange={(value) => updateSetting("visionModel", value)}
            placeholder="google/gemini-3-flash-preview"
            value={settings.visionModel ?? ""}
          />
          <SettingsField
            label="Image Model"
            onChange={(value) => updateSetting("imageModel", value)}
            placeholder="google/gemini-2.5-flash-image"
            value={settings.imageModel ?? ""}
          />

          <div className="rounded-md border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-white/45">Saved preview</p>
            <pre className="overflow-auto text-xs text-white/65">
              {masked ? JSON.stringify(masked, null, 2) : "No browser settings saved."}
            </pre>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 p-4">
          <button
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-white/10"
            onClick={clear}
            type="button"
          >
            <Trash2 size={15} />
            Clear
          </button>
          <div className="flex items-center gap-3">
            {saved ? <span className="text-sm text-emerald-200">Saved</span> : null}
            <button
              className="rounded-full bg-emerald-300 px-5 py-2 text-sm font-medium text-black hover:bg-emerald-200"
              onClick={save}
              type="button"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsField({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "password";
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-white/65">{label}</span>
      <input
        className="min-h-11 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-emerald-300"
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}
