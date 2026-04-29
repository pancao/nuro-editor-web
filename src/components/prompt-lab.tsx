"use client";

import Link from "next/link";
import { ArrowLeft, Play, RefreshCw, Settings, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  clearBrowserAISettings,
  hasAISettings,
  loadBrowserAISettings,
  maskAISettings,
  saveBrowserAISettings,
  withBrowserAISettings,
} from "@/lib/ai-settings";
import { loadEditorSession } from "@/lib/editor-storage";
import type { AISettings, ImageAsset, PromptTemplate } from "@/lib/types";

const defaultVariables = {
  imageDescription: "the current imported photo",
  toolCategory: "Style",
  subTool: "Style",
  userInput: "make it cinematic but natural",
  currentParams: {},
  cropBox: { x: 0, y: 0, width: 1000, height: 1000 },
  language: "English",
};

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(withBrowserAISettings(payload as Record<string, unknown>)),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body as T;
}

export function PromptLab() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [variablesText, setVariablesText] = useState(JSON.stringify(defaultVariables, null, 2));
  const [image, setImage] = useState<ImageAsset | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiSettings, setAISettings] = useState<AISettings>(() => loadBrowserAISettings() ?? {});
  const [settingsSaved, setSettingsSaved] = useState(false);
  const selectedPrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === selectedPromptId),
    [prompts, selectedPromptId],
  );

  useEffect(() => {
    fetch("/api/prompts")
      .then((response) => response.json())
      .then((body: { prompts: PromptTemplate[] }) => {
        setPrompts(body.prompts);
        setSelectedPromptId(body.prompts[0]?.id ?? "");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Failed to load prompts"));

    loadEditorSession()
      .then((session) => setImage(session?.currentImage ?? null))
      .catch(() => undefined);
  }, []);

  function saveSettings() {
    saveBrowserAISettings(aiSettings);
    setAISettings(loadBrowserAISettings() ?? {});
    setSettingsSaved(true);
    window.setTimeout(() => setSettingsSaved(false), 1400);
  }

  function clearSettings() {
    clearBrowserAISettings();
    setAISettings({});
    setSettingsSaved(false);
  }

  function updateSetting(key: keyof AISettings, value: string) {
    setAISettings((previous) => ({ ...previous, [key]: value }));
    setSettingsSaved(false);
  }

  async function runPrompt() {
    if (!selectedPrompt) return;
    setError("");
    setResult(null);
    try {
      const variables = JSON.parse(variablesText);
      const response = await postJson("/api/prompts/test", {
        promptTemplateId: selectedPrompt.id,
        image: image?.dataUrl,
        variables,
      });
      setResult(response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Prompt test failed");
    }
  }

  return (
    <main className="min-h-screen bg-[#101114] text-[#f5f1e8]">
      <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b border-white/10 bg-[#101114]/85 px-4 backdrop-blur-md md:px-6">
        <Link className="inline-flex items-center gap-2 text-sm text-white/75 hover:text-white" href="/">
          <ArrowLeft size={16} />
          Editor
        </Link>
        <h1 className="text-lg font-semibold">Prompt Lab</h1>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-sm text-white/80 hover:bg-black/45"
            onClick={() => setSettingsOpen(true)}
            type="button"
          >
            <Settings size={16} />
            Settings
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full bg-emerald-300 px-4 py-2 text-sm font-medium text-black"
            onClick={runPrompt}
            type="button"
          >
            <Play size={16} />
            Run
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <AISettingsPanel
          onChange={updateSetting}
          onClear={clearSettings}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
          saved={settingsSaved}
          settings={aiSettings}
        />
      ) : null}

      <section className="grid min-h-[calc(100vh-4rem)] grid-cols-1 md:grid-cols-[280px_1fr_420px]">
        <aside className="border-b border-white/10 p-4 md:border-b-0 md:border-r">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/80">Templates</h2>
            <RefreshCw size={15} className="text-white/45" />
          </div>
          <div className="flex flex-col gap-2">
            {prompts.map((prompt) => (
              <button
                className={`rounded-md px-3 py-2 text-left text-sm ${
                  selectedPromptId === prompt.id
                    ? "bg-emerald-300 text-black"
                    : "bg-white/[0.08] text-white/75 hover:bg-white/[0.12]"
                }`}
                key={prompt.id}
                onClick={() => setSelectedPromptId(prompt.id)}
                type="button"
              >
                <span className="block font-medium">{prompt.title}</span>
                <span className="block text-xs opacity-70">{prompt.id}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-4 border-b border-white/10 p-4 md:border-b-0 md:border-r">
          <div>
            <p className="mb-2 text-sm text-white/55">Template</p>
            <textarea
              className="min-h-48 w-full resize-y rounded-md border border-white/10 bg-black/25 p-3 font-mono text-sm text-white outline-none focus:border-emerald-300"
              readOnly
              value={selectedPrompt?.template ?? ""}
            />
          </div>
          <div>
            <p className="mb-2 text-sm text-white/55">Variables JSON</p>
            <textarea
              className="min-h-72 w-full resize-y rounded-md border border-white/10 bg-black/25 p-3 font-mono text-sm text-white outline-none focus:border-emerald-300"
              onChange={(event) => setVariablesText(event.currentTarget.value)}
              value={variablesText}
            />
          </div>
          {image ? (
            <div>
              <p className="mb-2 text-sm text-white/55">Current editor image</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Prompt test input" className="max-h-44 rounded-md border border-white/10 object-contain" src={image.dataUrl} />
            </div>
          ) : (
            <p className="text-sm text-white/45">No editor image found. Prompt tests still run with text context.</p>
          )}
        </section>

        <section className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-white/80">Result</h2>
          {error ? <p className="rounded-md border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
          <pre className="min-h-96 overflow-auto rounded-md border border-white/10 bg-black/30 p-3 text-xs text-white/75">
            {result ? JSON.stringify(result, null, 2) : "Run a prompt to inspect request payload, raw response, and parsed output."}
          </pre>
        </section>
      </section>
    </main>
  );
}

function AISettingsPanel({
  onChange,
  onClear,
  onClose,
  onSave,
  saved,
  settings,
}: {
  onChange: (key: keyof AISettings, value: string) => void;
  onClear: () => void;
  onClose: () => void;
  onSave: () => void;
  saved: boolean;
  settings: AISettings;
}) {
  const source = hasAISettings(settings) ? "Browser settings" : ".env fallback";
  const masked = maskAISettings(settings);

  return (
    <div className="fixed inset-0 z-50 bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="ml-auto flex h-full w-full max-w-md flex-col rounded-xl border border-white/10 bg-[#17181c] shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">AI Settings</h2>
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
          <SettingsField label="Provider" value={settings.provider ?? ""} onChange={(value) => onChange("provider", value)} placeholder="cherryin or openai" />
          <SettingsField label="Base URL" value={settings.baseUrl ?? ""} onChange={(value) => onChange("baseUrl", value)} placeholder="https://open.cherryin.net/v1" />
          <SettingsField label="API Key" value={settings.apiKey ?? ""} onChange={(value) => onChange("apiKey", value)} placeholder="sk-..." type="password" />
          <SettingsField label="Vision Model" value={settings.visionModel ?? ""} onChange={(value) => onChange("visionModel", value)} placeholder="google/gemini-3-flash-preview" />
          <SettingsField label="Image Model" value={settings.imageModel ?? ""} onChange={(value) => onChange("imageModel", value)} placeholder="google/gemini-2.5-flash-image" />

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
            onClick={onClear}
            type="button"
          >
            <Trash2 size={15} />
            Clear
          </button>
          <div className="flex items-center gap-3">
            {saved ? <span className="text-sm text-emerald-200">Saved</span> : null}
            <button
              className="rounded-full bg-emerald-300 px-5 py-2 text-sm font-medium text-black hover:bg-emerald-200"
              onClick={onSave}
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
