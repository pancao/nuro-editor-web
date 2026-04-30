"use client";

import Link from "next/link";
import { ArrowLeft, Play, RefreshCw, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { withBrowserAISettings } from "@/lib/ai-settings";
import { loadEditorSession } from "@/lib/editor-storage";
import type { ImageAsset, PromptTemplate } from "@/lib/types";
import { AISettingsDialog } from "@/components/ai-settings-dialog";

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

      <AISettingsDialog onClose={() => setSettingsOpen(false)} open={settingsOpen} />

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

