"use client";

import Link from "next/link";
import {
  Aperture,
  ArrowLeftRight,
  Brush,
  Circle,
  CircleDot,
  Contrast,
  Crop,
  Download,
  Droplet,
  Droplets,
  Eraser,
  ImagePlus,
  Maximize2,
  Minus,
  Moon,
  Palette,
  PersonStanding,
  Pipette,
  Plus,
  PlusCircle,
  Replace,
  RotateCcw,
  RotateCw,
  Scan,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Sun,
  SunMedium,
  Thermometer,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { withBrowserAISettings } from "@/lib/ai-settings";
import {
  applyAdjustmentsToImage,
  createOutpaintGuideImage,
  cropImageWithRotation,
  dataUrlToAsset,
  downloadDataUrl,
  fileToImageAsset,
} from "@/lib/browser-image";
import {
  cropToRenderedRect,
  normalizeRenderedRect,
  renderedRectToCrop,
  type RenderedImageBox,
} from "@/lib/crop-overlay";
import { isCropWithinImage } from "@/lib/crop";
import { loadEditorSession, saveEditorSession } from "@/lib/editor-storage";
import {
  collectBatchSuggestionTargets,
  getCachedSuggestions,
  normalizeSuggestionGroups,
  suggestionCacheKey,
} from "@/lib/suggestions";
import { enabledTools } from "@/lib/tools";
import type {
  AdjustmentParams,
  AISuggestion,
  CropBox,
  EditOperation,
  GenerationJob,
  ImageAsset,
  SuggestionGroup,
  ToolAction,
  ToolId,
} from "@/lib/types";

const iconMap = {
  aperture: Aperture,
  "arrow-left-right": ArrowLeftRight,
  brush: Brush,
  circle: Circle,
  "circle-dot": CircleDot,
  contrast: Contrast,
  crop: Crop,
  droplet: Droplet,
  droplets: Droplets,
  eraser: Eraser,
  moon: Moon,
  palette: Palette,
  "person-standing": PersonStanding,
  pipette: Pipette,
  plus: Plus,
  "plus-circle": PlusCircle,
  replace: Replace,
  "rotate-cw": RotateCw,
  scan: Scan,
  "sliders-horizontal": SlidersHorizontal,
  smile: Smile,
  sparkles: Sparkles,
  sun: Sun,
  "sun-medium": SunMedium,
  thermometer: Thermometer,
  "wand-2": Wand2,
};

function nowId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hashSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(withBrowserAISettings(payload as Record<string, unknown>)),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  // Dev-only signal: backend fell back to mock/backup data instead of the configured provider.
  if (
    process.env.NODE_ENV !== "production" &&
    typeof window !== "undefined" &&
    body &&
    typeof body === "object" &&
    (body as { usedMock?: boolean }).usedMock === true
  ) {
    window.dispatchEvent(
      new CustomEvent("nuro:mock-fallback", {
        detail: {
          url,
          reason: (body as { mockReason?: string }).mockReason ?? "Unknown reason",
        },
      }),
    );
  }
  return body as T;
}

function systemParams(actionId: string): AdjustmentParams {
  if (actionId === "auto-wb") return { warmth: 8, saturation: 3, brightness: 2 };
  return { exposure: 10, brightness: 6, contrast: 4 };
}

function adjustmentParamForAction(actionId: string, value: number): AdjustmentParams {
  if (actionId === "exposure") return { exposure: value };
  if (actionId === "brilliance") return { brilliance: value };
  if (actionId === "brightness" || actionId === "color-brightness") return { brightness: value };
  if (actionId === "contrast" || actionId === "color-contrast") return { contrast: value };
  if (actionId === "highlights") return { highlights: value };
  if (actionId === "shadows") return { shadows: value };
  if (actionId === "black-point") return { blacks: value };
  if (actionId === "saturation") return { saturation: value };
  if (actionId === "vibrance") return { vibrance: value };
  if (actionId === "warmth") return { warmth: value };
  if (actionId === "tint") return { tint: value };
  return systemParams(actionId);
}

function cssFilterForAction(actionId: string, value: number): string {
  if (value === 0) return "";
  const v = value / 100;
  switch (actionId) {
    case "exposure":
      return `brightness(${1 + v}) contrast(${1 + v * 0.4})`;
    case "brightness":
    case "color-brightness":
      return `brightness(${1 + v})`;
    case "contrast":
    case "color-contrast":
      return `contrast(${1 + v})`;
    case "saturation":
      return `saturate(${1 + v * 2})`;
    case "vibrance":
      return `saturate(${1 + v * 1.2})`;
    case "highlights":
      return `brightness(${1 + v * 0.5}) contrast(${1 - v * 0.2})`;
    case "shadows":
      return `brightness(${1 + v * 0.4}) contrast(${1 - v * 0.15})`;
    case "black-point":
      return `contrast(${1 + v * 1.2})`;
    case "brilliance":
      return `contrast(${1 + v * 0.7}) saturate(${1 + v * 0.5})`;
    case "warmth":
      return value > 0
        ? `sepia(${v}) saturate(${1 + v * 0.4})`
        : `hue-rotate(${value * 1.2}deg) saturate(${1 - v * 0.4})`;
    case "tint":
      return `hue-rotate(${value * 0.6}deg)`;
    default:
      return "";
  }
}

function isManualAdjustment(actionId: string) {
  return [
    "exposure",
    "brilliance",
    "brightness",
    "color-brightness",
    "contrast",
    "color-contrast",
    "highlights",
    "shadows",
    "black-point",
    "saturation",
    "vibrance",
    "warmth",
    "tint",
  ].includes(actionId);
}

function actionSuggestionKey(toolId: string, actionId: string) {
  return `${toolId}:${actionId}`;
}

function mapCropToSourceRect(crop: CropBox, sourceRect: CropBox, image: ImageAsset): CropBox {
  const scaleX = sourceRect.width / image.width;
  const scaleY = sourceRect.height / image.height;
  return {
    x: Math.round(sourceRect.x + crop.x * scaleX),
    y: Math.round(sourceRect.y + crop.y * scaleY),
    width: Math.round(crop.width * scaleX),
    height: Math.round(crop.height * scaleY),
  };
}

export function PhotoEditor() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [originalImage, setOriginalImage] = useState<ImageAsset | null>(null);
  const [currentImage, setCurrentImage] = useState<ImageAsset | null>(null);
  const [history, setHistory] = useState<EditOperation[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentSourceRect, setCurrentSourceRect] = useState<CropBox | null>(null);
  // Rotation (degrees) baked into currentImage relative to originalImage.
  // Mirrors currentSourceRect — updated alongside it on crop ops, restore,
  // undo/redo, and import.
  const [currentRotation, setCurrentRotation] = useState(0);
  const [historyStackOpen, setHistoryStackOpen] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState<ToolId>("light");
  const [selectedActionId, setSelectedActionId] = useState("auto-exposure");
  const [railMode, setRailMode] = useState<"tools" | "actions">("tools");
  const [operationVisible, setOperationVisible] = useState(true);
  const [suggestionCache, setSuggestionCache] = useState<Record<string, AISuggestion[]>>({});
  const [suggestionDisplayCache, setSuggestionDisplayCache] = useState<Record<string, AISuggestion[]>>({});
  const [loadingSuggestions, setLoadingSuggestions] = useState<Record<string, boolean>>({});
  const [customPrompt, setCustomPrompt] = useState("");
  const [adjustmentValue, setAdjustmentValue] = useState(0);
  // Tracks the last *displayed* (and applied) adjustment value per action so
  // re-opening Brightness etc. keeps the slider where the user left it. Each
  // apply commits the delta against this baseline, not the absolute value.
  const [lastAdjustmentByAction, setLastAdjustmentByAction] = useState<Record<string, number>>({});
  const [job, setJob] = useState<GenerationJob>({ status: "idle" });
  const [cropBox, setCropBox] = useState<CropBox>({ x: 0, y: 0, width: 1000, height: 1000 });
  // Rotation (degrees, clockwise) applied to the originalImage while the crop
  // tool is active. Reset on tool/action change and on apply.
  const [cropRotation, setCropRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [hasPeople, setHasPeople] = useState<boolean | null>(null);
  const [mockNotice, setMockNotice] = useState<{ url: string; reason: string; ts: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panSessionRef = useRef<{
    pointerId: number;
    startPan: { x: number; y: number };
    startX: number;
    startY: number;
  } | null>(null);

  // Dev-only popup: listen for fallback events emitted from postJson.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    function handler(event: Event) {
      const detail = (event as CustomEvent<{ url: string; reason: string }>).detail;
      setMockNotice({ ...detail, ts: Date.now() });
    }
    window.addEventListener("nuro:mock-fallback", handler);
    return () => window.removeEventListener("nuro:mock-fallback", handler);
  }, []);

  useEffect(() => {
    if (!mockNotice) return;
    const timer = window.setTimeout(() => setMockNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [mockNotice]);
  const availableTools = useMemo(
    () => enabledTools.filter((tool) => tool.id !== "face" || hasPeople !== false),
    [hasPeople],
  );
  const selectedTool = useMemo(
    () => availableTools.find((tool) => tool.id === selectedToolId) ?? availableTools[0],
    [availableTools, selectedToolId],
  );
  const selectedAction =
    selectedTool.actions.find((action) => action.id === selectedActionId) ?? selectedTool.actions[0];
  const livePreviewFilter =
    selectedAction?.flow === "system-adjust" && isManualAdjustment(selectedAction.id)
      ? cssFilterForAction(selectedAction.id, adjustmentValue)
      : "";
  const imageSpecificSuggestions = getCachedSuggestions(
    suggestionCache,
    currentImage,
    selectedTool.id,
    selectedAction?.id ?? "",
  );
  const selectedSuggestions =
    imageSpecificSuggestions.length > 0
      ? imageSpecificSuggestions
      : suggestionDisplayCache[actionSuggestionKey(selectedTool.id, selectedAction?.id ?? "")] ?? [];
  const suggestionSetKey = selectedSuggestions.map((suggestion) => suggestion.id).join(":");
  const promptLabEnabled =
    process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_PROMPT_LAB === "true";
  const isImageProcessing =
    job.status === "loading" &&
    (job.message?.includes("Generating") || job.message?.includes("Expanding"));
  // While the Crop tool is active, cropBox is authored directly in
  // originalImage coordinates (so users can drag handles past the current
  // crop's edges to recover original pixels). For any other tool, the legacy
  // mapping via the previous sourceRect is still used for callers that read
  // cropInOriginalSpace.
  const cropInOriginalSpace =
    selectedToolId === "crop"
      ? cropBox
      : currentImage && currentSourceRect
        ? mapCropToSourceRect(cropBox, currentSourceRect, currentImage)
        : cropBox;

  useEffect(() => {
    loadEditorSession()
      .then((session) => {
        if (!session) return;
        setOriginalImage(session.originalImage);
        setCurrentImage(session.currentImage);
        setHistory(session.history);
        setHistoryIndex(session.historyIndex);
        const operation = session.history[session.historyIndex];
        setCurrentSourceRect(
          operation?.sourceRect ??
            (session.currentImage
              ? { x: 0, y: 0, width: session.currentImage.width, height: session.currentImage.height }
              : null),
        );
        setCurrentRotation(operation?.rotation ?? 0);
        if (session.currentImage) {
          void detectScene(session.currentImage);
          void refreshAllRecommendations(session.currentImage);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!originalImage && !currentImage) return;
    saveEditorSession({ originalImage, currentImage, history, historyIndex }).catch(() => undefined);
  }, [originalImage, currentImage, history, historyIndex]);

  // While the Crop tool is active the workspace shows the *originalImage* so
  // the user can drag the crop handles outward to recover pixels that the
  // current edit had cropped away. Otherwise the workspace shows currentImage.
  const workspaceImage = selectedToolId === "crop" && originalImage ? originalImage : currentImage;

  const imageFit = useMemo(() => {
    if (!workspaceImage || stageSize.width === 0 || stageSize.height === 0) {
      return { width: 0, height: 0 };
    }
    const padding = 96;
    const baseScale = 0.72;
    const availableW = Math.max(64, stageSize.width - padding);
    const availableH = Math.max(64, stageSize.height - padding);
    const imgRatio = workspaceImage.width / workspaceImage.height;
    const stageRatio = availableW / availableH;
    const fit =
      imgRatio > stageRatio
        ? { width: availableW, height: availableW / imgRatio }
        : { width: availableH * imgRatio, height: availableH };
    return { width: fit.width * baseScale, height: fit.height * baseScale };
  }, [workspaceImage, stageSize]);

  const renderedBox: RenderedImageBox | null =
    workspaceImage && imageFit.width > 0
      ? {
          width: imageFit.width,
          height: imageFit.height,
          naturalWidth: workspaceImage!.width,
          naturalHeight: workspaceImage!.height,
        }
      : null;

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    function update() {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setStageSize({ width: rect.width, height: rect.height });
    }
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const fitRef = useRef(imageFit);
  zoomRef.current = zoom;
  panRef.current = pan;
  fitRef.current = imageFit;

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    function onWheel(event: WheelEvent) {
      if (!element || fitRef.current.width === 0) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const factor = Math.exp(-event.deltaY * 0.0015);
      const z = zoomRef.current;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
      if (next === z) return;
      const p = panRef.current;
      const ratio = next / z;
      setZoom(next);
      setPan({
        x: dx - ratio * (dx - p.x),
        y: dy - ratio * (dy - p.y),
      });
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  function navigateToNormalized(nx: number, ny: number) {
    if (imageFit.width === 0) return;
    setPan({
      x: -zoom * imageFit.width * (nx - 0.5),
      y: -zoom * imageFit.height * (ny - 0.5),
    });
  }

  function onStagePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!currentImage) return;
    if (!event.isPrimary || event.button !== 0) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      if (target.closest("[data-editor-ui]")) return;
      const tagName = target.tagName;
      if (
        tagName === "BUTTON" ||
        tagName === "A" ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
    }
    event.preventDefault();
    panSessionRef.current = {
      pointerId: event.pointerId,
      startPan: { ...pan },
      startX: event.clientX,
      startY: event.clientY,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    window.addEventListener("blur", endStagePanOnBlur);
  }

  function onStagePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const session = panSessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    if (event.buttons === 0) {
      endStagePan(event.currentTarget);
      return;
    }
    event.preventDefault();
    setPan({
      x: session.startPan.x + (event.clientX - session.startX),
      y: session.startPan.y + (event.clientY - session.startY),
    });
  }

  function onStagePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const session = panSessionRef.current;
    if (!session || event.pointerId === session.pointerId) {
      endStagePan(event.currentTarget);
    }
  }

  function endStagePanOnBlur() {
    endStagePan(stageRef.current);
  }

  function endStagePan(element: HTMLDivElement | null) {
    const session = panSessionRef.current;
    panSessionRef.current = null;
    setIsPanning(false);
    window.removeEventListener("blur", endStagePanOnBlur);
    if (session && element?.hasPointerCapture(session.pointerId)) {
      element.releasePointerCapture(session.pointerId);
    }
  }

  const minimapViewport = useMemo(() => {
    if (!currentImage || imageFit.width === 0) {
      return { left: 0, top: 0, width: 1, height: 1 };
    }
    const halfW = stageSize.width / (2 * zoom * imageFit.width);
    const halfH = stageSize.height / (2 * zoom * imageFit.height);
    const cx = 0.5 - pan.x / (zoom * imageFit.width);
    const cy = 0.5 - pan.y / (zoom * imageFit.height);
    const left = Math.max(0, cx - halfW);
    const right = Math.min(1, cx + halfW);
    const top = Math.max(0, cy - halfH);
    const bottom = Math.min(1, cy + halfH);
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }, [currentImage, imageFit, stageSize, zoom, pan]);

  async function fetchSingleSuggestions(image: ImageAsset, toolId: ToolId, action: ToolAction) {
    const key = suggestionCacheKey(image.id, toolId, action.id);
    if (suggestionCache[key] || loadingSuggestions[key] || !action.requiresSuggestion) return;
    setLoadingSuggestions((previous) => ({ ...previous, [key]: true }));
    try {
      const response = await postJson<{ suggestions: AISuggestion[] }>("/api/ai/suggestions", {
        image: image.dataUrl,
        toolId,
        actionId: action.id,
        context: { image: { width: image.width, height: image.height } },
      });
      setSuggestionCache((previous) => ({ ...previous, [key]: response.suggestions }));
      setSuggestionDisplayCache((previous) => ({
        ...previous,
        [actionSuggestionKey(toolId, action.id)]: response.suggestions,
      }));
    } catch (error) {
      setJob({
        status: "error",
        message: error instanceof Error ? error.message : "Recommendation failed",
      });
    } finally {
      setLoadingSuggestions((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    }
  }

  async function detectScene(image: ImageAsset) {
    try {
      const response = await postJson<{ hasPeople?: boolean }>("/api/ai/scene", {
        image: image.dataUrl,
      });
      const detected = response.hasPeople === true;
      setHasPeople(detected);
      if (!detected && selectedToolId === "face") {
        setSelectedToolId("light");
        setSelectedActionId("auto-exposure");
        setRailMode("tools");
      }
    } catch {
      setHasPeople(true);
    }
  }

  async function refreshAllRecommendations(image: ImageAsset) {
    const tools = enabledTools.filter((tool) => tool.id !== "face" || hasPeople !== false);
    const targets = collectBatchSuggestionTargets(tools);
    if (targets.length === 0) return;
    setLoadingSuggestions(
      Object.fromEntries(
        targets.map((target) => [suggestionCacheKey(image.id, target.toolId, target.actionId), true]),
      ),
    );
    try {
      const response = await postJson<{ groups: SuggestionGroup[] }>("/api/ai/suggestions/batch", {
        image: image.dataUrl,
        targets,
        context: { image: { width: image.width, height: image.height } },
      });
      const normalized = normalizeSuggestionGroups(image, response.groups);
      setSuggestionCache((previous) => ({ ...previous, ...normalized }));
      setSuggestionDisplayCache((previous) => ({
        ...previous,
        ...Object.fromEntries(
          response.groups.map((group) => [
            actionSuggestionKey(group.toolId, group.actionId),
            group.suggestions,
          ]),
        ),
      }));
    } catch (error) {
      setJob({
        status: "error",
        message: error instanceof Error ? error.message : "Batch recommendations failed",
      });
    } finally {
      setLoadingSuggestions({});
    }
  }

  async function importFile(file: File) {
    const asset = await fileToImageAsset(file);
    const operation: EditOperation = {
      id: nowId(),
      toolId: "light",
      actionId: "import",
      label: "Imported original",
      image: asset,
      createdAt: new Date().toISOString(),
      sourceRect: { x: 0, y: 0, width: asset.width, height: asset.height },
    };
    setOriginalImage(asset);
    setCurrentImage(asset);
    setHistory([operation]);
    setHistoryIndex(0);
    setCurrentSourceRect(operation.sourceRect ?? null);
    setCurrentRotation(0);
    setSelectedToolId("light");
    setSelectedActionId("auto-exposure");
    setRailMode("tools");
    setOperationVisible(true);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSuggestionCache({});
    setLoadingSuggestions({});
    setCustomPrompt("");
    setAdjustmentValue(0);
    setLastAdjustmentByAction({});
    setCropBox({ x: 0, y: 0, width: asset.width, height: asset.height });
    setHasPeople(null);
    void detectScene(asset);
    void refreshAllRecommendations(asset);
  }

  function pushOperation(operation: Omit<EditOperation, "id" | "createdAt">) {
    const next: EditOperation = { ...operation, id: nowId(), createdAt: new Date().toISOString() };
    const sliced = history.slice(0, historyIndex + 1);
    const appended = [...sliced, next];
    // Cap history at the original (index 0) + 9 most recent edits = 10 total.
    // When the cap is exceeded, drop the oldest non-original entries.
    const MAX_HISTORY = 10;
    const trimmed =
      appended.length > MAX_HISTORY
        ? [appended[0], ...appended.slice(appended.length - (MAX_HISTORY - 1))]
        : appended;
    setHistory(trimmed);
    setHistoryIndex(trimmed.length - 1);
    setCurrentImage(next.image);
    setCurrentSourceRect(
      next.sourceRect ?? currentSourceRect ?? { x: 0, y: 0, width: next.image.width, height: next.image.height },
    );
    if (next.sourceRect !== undefined) {
      // Geometry changed — adopt this op's rotation (0 if not set).
      setCurrentRotation(next.rotation ?? 0);
    }
    void refreshAllRecommendations(next.image);
  }

  function restoreHistory(index: number) {
    const operation = history[index];
    if (!operation) return;
    setHistoryIndex(index);
    setCurrentImage(operation.image);
    setCurrentSourceRect(
      operation.sourceRect ?? { x: 0, y: 0, width: operation.image.width, height: operation.image.height },
    );
    setCurrentRotation(operation.rotation ?? 0);
    setCropBox({ x: 0, y: 0, width: operation.image.width, height: operation.image.height });
    setLastAdjustmentByAction({});
    setAdjustmentValue(0);
    setHistoryStackOpen(false);
    void refreshAllRecommendations(operation.image);
  }

  function undo() {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setCurrentImage(history[nextIndex].image);
    setCurrentSourceRect(
      history[nextIndex].sourceRect ?? {
        x: 0,
        y: 0,
        width: history[nextIndex].image.width,
        height: history[nextIndex].image.height,
      },
    );
    setCurrentRotation(history[nextIndex].rotation ?? 0);
    setCropBox({ x: 0, y: 0, width: history[nextIndex].image.width, height: history[nextIndex].image.height });
    void refreshAllRecommendations(history[nextIndex].image);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setCurrentImage(history[nextIndex].image);
    setCurrentSourceRect(
      history[nextIndex].sourceRect ?? {
        x: 0,
        y: 0,
        width: history[nextIndex].image.width,
        height: history[nextIndex].image.height,
      },
    );
    setCurrentRotation(history[nextIndex].rotation ?? 0);
    setCropBox({ x: 0, y: 0, width: history[nextIndex].image.width, height: history[nextIndex].image.height });
    void refreshAllRecommendations(history[nextIndex].image);
  }

  // Apply the slider's current value as a delta against the previously-applied
  // value for this action. The slider stays at the new absolute position so
  // users see where they last left it; the image only receives the difference.
  function commitManualAdjustment(targetValue?: number) {
    if (!selectedAction || !isManualAdjustment(selectedAction.id)) return;
    const target = targetValue ?? adjustmentValue;
    const previous = lastAdjustmentByAction[selectedAction.id] ?? 0;
    const delta = target - previous;
    if (delta === 0) return;
    const actionId = selectedAction.id;
    const label = `${selectedAction.label} ${target > 0 ? "+" : ""}${target}`;
    void applyLocalParams(label, adjustmentParamForAction(actionId, delta));
    setLastAdjustmentByAction((prev) => ({ ...prev, [actionId]: target }));
    if (targetValue !== undefined && targetValue !== adjustmentValue) {
      setAdjustmentValue(target);
    }
  }

  async function applyLocalParams(label: string, params: AdjustmentParams) {
    if (!currentImage || !selectedAction) return;
    setJob({ status: "loading", message: "Applying local adjustments" });
    try {
      const image = await applyAdjustmentsToImage(currentImage, params);
      pushOperation({
        toolId: selectedTool.id,
        actionId: selectedAction.id,
        label,
        image,
        params,
        sourceRect: currentSourceRect ?? undefined,
      });
      setJob({ status: "success" });
    } catch (error) {
      setJob({ status: "error", message: error instanceof Error ? error.message : "Canvas failed" });
    }
  }

  async function useSuggestion(suggestion: AISuggestion) {
    if (!currentImage || !selectedAction) return;
    if (selectedAction.flow === "ai-suggest-params") {
      setJob({ status: "loading", message: "AI is mapping suggestion to parameters" });
      try {
        const response = await postJson<{ params: AdjustmentParams }>("/api/ai/params", {
          image: currentImage.dataUrl,
          toolId: selectedTool.id,
          actionId: selectedAction.id,
          selection: suggestion,
        });
        await applyLocalParams(suggestion.label, response.params);
      } catch (error) {
        setJob({ status: "error", message: error instanceof Error ? error.message : "AI failed" });
      }
      return;
    }
    await generateFromPrompt(suggestion.label, suggestion.prompt, suggestion);
  }

  async function generateFromPrompt(label: string, prompt: string, selection?: AISuggestion) {
    if (!currentImage || !selectedAction) return;
    setJob({ status: "loading", message: "Generating image" });
    try {
      const response = await postJson<{ image: string }>("/api/ai/generate", {
        image: currentImage.dataUrl,
        toolId: selectedTool.id,
        actionId: selectedAction.id,
        prompt,
        selection,
        context: { toolCategory: selectedTool.label, subTool: selectedAction.label },
      });
      const image = await dataUrlToAsset(response.image, `${selectedTool.id}-${selectedAction.id}.png`);
      pushOperation({
        toolId: selectedTool.id,
        actionId: selectedAction.id,
        label,
        image,
        sourceRect: currentSourceRect ?? undefined,
      });
      setJob({ status: "success" });
    } catch (error) {
      setJob({ status: "error", message: error instanceof Error ? error.message : "Generation failed" });
    }
  }

  async function applyCrop() {
    if (!currentImage || !selectedAction) return;
    if (!originalImage) return;
    const mappedCrop = cropInOriginalSpace;
    const rotation = cropRotation;
    const localCrop = isCropWithinImage(mappedCrop, originalImage);
    setJob({ status: "loading", message: localCrop ? "Cropping locally" : "Expanding with AI" });
    try {
      const image = localCrop
        ? await cropImageWithRotation(originalImage, mappedCrop, rotation)
        : await outpaint(mappedCrop, rotation);

      if (localCrop) {
        // Local crop: keep the originalImage chain intact so re-entering Crop
        // can reveal pixels we cropped away. Persist this op's geometry +
        // rotation so the box restores exactly next time.
        pushOperation({
          toolId: "crop",
          actionId: selectedAction.id,
          label: rotation
            ? `Crop ${rotation > 0 ? "+" : ""}${Math.round(rotation)}°`
            : "Crop",
          image,
          sourceRect: mappedCrop,
          rotation: rotation || undefined,
        });
      } else {
        // AI Expand: the result is a brand-new baseline. Promote it to
        // originalImage so subsequent crops work against this image and the
        // crop box fills the new frame on re-entry. No geometry to track —
        // rotation is baked into the new pixels.
        setOriginalImage(image);
        pushOperation({
          toolId: "crop",
          actionId: selectedAction.id,
          label: rotation
            ? `AI Expand ${rotation > 0 ? "+" : ""}${Math.round(rotation)}°`
            : "AI Expand",
          image,
          sourceRect: { x: 0, y: 0, width: image.width, height: image.height },
        });
      }

      // Exit crop mode: deselect the tool and drop the user back on the
      // tool rail so the canvas surfaces the new (cropped) currentImage
      // instead of the originalImage workspace.
      const lightTool = availableTools.find((tool) => tool.id === "light");
      setSelectedToolId("light");
      setSelectedActionId(lightTool?.actions[0]?.id ?? "");
      setRailMode("tools");
      setOperationVisible(false);
      setCustomPrompt("");
      setJob({ status: "success" });
    } catch (error) {
      setJob({ status: "error", message: error instanceof Error ? error.message : "Crop failed" });
    }
  }

  async function outpaint(mappedCrop: CropBox, rotation = 0) {
    if (!originalImage) throw new Error("No image loaded");
    const guideImage = await createOutpaintGuideImage(originalImage, mappedCrop, rotation);
    const response = await postJson<{ image: string }>("/api/ai/outpaint", {
      image: guideImage.dataUrl,
      toolId: "crop",
      actionId: "frame",
      cropBox: mappedCrop,
      context: {
        guideImage: { width: guideImage.width, height: guideImage.height },
        originalImage: { width: originalImage.width, height: originalImage.height },
        rotation,
      },
    });
    return dataUrlToAsset(response.image, "outpaint.png");
  }

  function selectTool(toolId: ToolId) {
    commitManualAdjustment();
    const tool = availableTools.find((item) => item.id === toolId) ?? availableTools[0];
    const action = tool.actions[0];
    setSelectedToolId(tool.id);
    setSelectedActionId(action?.id ?? "");
    setRailMode(tool.actions.length > 1 ? "actions" : "tools");
    setOperationVisible(true);
    setCustomPrompt("");
    setAdjustmentValue(action ? (lastAdjustmentByAction[action.id] ?? 0) : 0);
    if (tool.id === "crop" && originalImage) {
      // Author cropBox in originalImage coordinates so the user can drag
      // handles outward past the current crop's edges. Also restore the
      // rotation that produced the current image so the workspace mirrors
      // what the user is editing.
      setCropBox(
        currentSourceRect ?? {
          x: 0,
          y: 0,
          width: originalImage.width,
          height: originalImage.height,
        },
      );
      setCropRotation(currentRotation);
    }
    if (currentImage && action?.requiresSuggestion) {
      void fetchSingleSuggestions(currentImage, tool.id, action);
    }
  }

  function selectAction(actionId: string) {
    commitManualAdjustment();
    const action = selectedTool.actions.find((item) => item.id === actionId);
    setSelectedActionId(actionId);
    setOperationVisible(true);
    setCustomPrompt("");
    setAdjustmentValue(lastAdjustmentByAction[actionId] ?? 0);
    if (currentImage && action?.requiresSuggestion) {
      void fetchSingleSuggestions(currentImage, selectedTool.id, action);
    }
  }

  function closeSubtools() {
    setRailMode("tools");
    setOperationVisible(false);
  }

  return (
    <main className="relative h-screen select-none overflow-hidden bg-[#101114] text-[#f5f1e8]">
      {/* Liquid Glass SVG filter — must live in DOM for backdrop-filter: url(#…) */}
      <svg
        aria-hidden="true"
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter
            id="liquid-glass-filter"
            x="0"
            y="0"
            width="1"
            height="1"
            filterUnits="objectBoundingBox"
            primitiveUnits="objectBoundingBox"
            colorInterpolationFilters="sRGB"
          >
            {/* 1. Load displacement map, stretched to fit the element bbox */}
            <feImage
              result="dispMap"
              href="/displacement-map.png"
              preserveAspectRatio="none"
              x="0"
              y="0"
              width="1"
              height="1"
            />
            {/* 2. Blur the backdrop. stdDeviation is in objectBoundingBox units (fraction of bbox). */}
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.04" result="blur" />
            {/* 3. Bump saturation so colors keep their punch through the blur. */}
            <feColorMatrix in="blur" type="saturate" values="1.5" result="saturated" />
            {/* 4. Refract the blurred+saturated result using the displacement map. */}
            <feDisplacementMap
              in="saturated"
              in2="dispMap"
              scale="0.3"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/* Soft blurred backdrop of the current image — fills the page with a faint
          color-matched ambience. Lives behind everything (z-0). */}
      {currentImage ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            src={currentImage.dataUrl}
            className="absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2 object-cover opacity-40"
            style={{ filter: "blur(80px) saturate(1.4)" }}
            draggable={false}
          />
          {/* Dark overlay to keep contrast against the dark page chrome. */}
          <div className="absolute inset-0 bg-[#101114]/55" />
        </div>
      ) : null}

      {/* Dev-only fallback notice: shown when an AI request returned mock/backup data. */}
      {mockNotice ? (
        <div data-editor-ui className="pointer-events-auto fixed left-1/2 top-20 z-50 -translate-x-1/2 max-w-[min(90vw,640px)] rounded-xl border border-amber-300/60 bg-amber-400/95 px-4 py-3 text-sm text-black shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
          <div className="flex items-start gap-3">
            <span className="text-base leading-none">⚠️</span>
            <div className="flex-1">
              <div className="font-semibold">AI 走的是 backup（mock）数据，不是浏览器里配置的提供商</div>
              <div className="mt-1 text-xs opacity-80 break-all">
                <code>{mockNotice.url}</code>
              </div>
              <div className="mt-1 text-xs opacity-80">原因：{mockNotice.reason}</div>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              className="spring-hover rounded-full px-2 text-black/70 hover:text-black"
              onClick={() => setMockNotice(null)}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      <div
        ref={stageRef}
        className="absolute inset-0 z-10 overflow-hidden"
        onLostPointerCapture={onStagePointerEnd}
        onPointerDown={onStagePointerDown}
        onPointerCancel={onStagePointerEnd}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerEnd}
        style={{
          cursor: isPanning ? "grabbing" : "default",
          touchAction: currentImage ? "none" : "auto",
        }}
      >
        {currentImage ? (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={
              imageFit.width > 0
                ? { width: imageFit.width, height: imageFit.height }
                : { maxWidth: "80%", maxHeight: "70%" }
            }
          >
            <div
              className="relative h-full w-full origin-center"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                alt="Current edit"
                className={`block h-full w-full select-none rounded-2xl object-cover shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] ${
                  isImageProcessing ? "image-processing-pulse" : ""
                }`}
                draggable={false}
                src={(workspaceImage ?? currentImage).dataUrl}
                style={{
                  ...(livePreviewFilter ? { filter: livePreviewFilter } : {}),
                  ...(selectedTool.id === "crop" && cropRotation
                    ? { transform: `rotate(${cropRotation}deg)` }
                    : {}),
                }}
              />
              {selectedTool.id === "crop" && operationVisible && workspaceImage ? (
                <div
                  className="absolute inset-0"
                  onPointerDown={(event) => event.stopPropagation()}
                  style={{ pointerEvents: "auto" }}
                >
                  <CropOverlay
                    cropBox={cropBox}
                    image={workspaceImage}
                    onChange={setCropBox}
                    renderedBox={renderedBox}
                    zoom={zoom}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <button
            className="absolute left-1/2 top-1/2 flex aspect-[4/3] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/25 bg-white/[0.03] text-white/75 transition-colors duration-200 hover:border-white/50 hover:bg-white/[0.08]"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <ImagePlus size={48} />
            <span className="text-lg">Import a photo to start editing</span>
          </button>
        )}
      </div>

      <header data-editor-ui className="pointer-events-auto absolute inset-x-0 top-0 z-50 flex items-start justify-between gap-2 px-4 pt-3 md:px-6 md:pt-4">
        <div className="liquid-glass pointer-events-auto rounded-2xl px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Nuro Editor" className="h-7 w-auto" draggable={false} />
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            className="liquid-glass inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm text-white/85"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload size={16} />
            Upload
          </button>
          {promptLabEnabled ? (
            <Link
              className="liquid-glass rounded-full px-3 py-2 text-sm text-white/85"
              href="/prompt-lab"
            >
              Prompt Lab
            </Link>
          ) : null}
          <button
            className="liquid-glass grid size-10 place-items-center rounded-full"
            disabled={historyIndex <= 0}
            onClick={undo}
            title="Undo"
            type="button"
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="liquid-glass grid size-10 place-items-center rounded-full"
            disabled={historyIndex >= history.length - 1}
            onClick={redo}
            title="Redo"
            type="button"
          >
            <RotateCw size={18} />
          </button>
          <button
            className="spring-hover grid size-10 place-items-center rounded-full bg-emerald-300 text-black shadow-[0_10px_40px_rgba(0,0,0,0.45)] hover:bg-emerald-200 disabled:opacity-35"
            disabled={!currentImage}
            onClick={() => currentImage && downloadDataUrl(currentImage.dataUrl, currentImage.name)}
            title="Export"
            type="button"
          >
            <Download size={18} />
          </button>
        </div>
      </header>

      {currentImage && imageFit.width > 0 ? (
        <ZoomNavigator
          image={currentImage}
          onNavigate={navigateToNormalized}
          onResetView={resetView}
          onZoomChange={setZoom}
          viewport={minimapViewport}
          zoom={zoom}
        />
      ) : null}

      {currentImage ? (
        <HistoryStack
          history={history}
          historyIndex={historyIndex}
          isOpen={historyStackOpen}
          onOpenChange={setHistoryStackOpen}
          onRestore={restoreHistory}
        />
      ) : null}

      <input
        ref={fileInputRef}
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importFile(file);
          event.currentTarget.value = "";
        }}
        type="file"
      />

      <EditorTray
        cropNeedsAi={originalImage ? !isCropWithinImage(cropInOriginalSpace, originalImage) : false}
        cropRotation={cropRotation}
        adjustmentValue={adjustmentValue}
        currentImage={currentImage}
        customPrompt={customPrompt}
        job={job}
        onApplyCrop={applyCrop}
        onApplyManualAdjustment={() => commitManualAdjustment()}
        onResetAdjustment={() => commitManualAdjustment(0)}
        onCloseSubtools={closeSubtools}
        onCustomPromptChange={setCustomPrompt}
        onGenerateCustom={() => {
          if (customPrompt.trim()) void generateFromPrompt("Custom edit", customPrompt.trim());
        }}
        onImport={() => fileInputRef.current?.click()}
        onLocalParams={applyLocalParams}
        onSelectAction={selectAction}
        onSelectTool={selectTool}
        onSetAdjustmentValue={setAdjustmentValue}
        onSetCropRotation={setCropRotation}
        onUseSuggestion={useSuggestion}
        operationVisible={operationVisible}
        railMode={railMode}
        selectedAction={selectedAction}
        selectedActionId={selectedActionId}
        selectedToolId={selectedToolId}
        suggestionSetKey={suggestionSetKey}
        suggestions={selectedSuggestions}
        tools={availableTools}
      />
    </main>
  );
}

type CropOverlayProps = {
  cropBox: CropBox;
  image: ImageAsset;
  onChange: (crop: CropBox) => void;
  renderedBox: RenderedImageBox | null;
  zoom?: number;
};

function CropOverlay({ cropBox, image, onChange, renderedBox, zoom = 1 }: CropOverlayProps) {
  const needsAi = !isCropWithinImage(cropBox, image);
  const box = renderedBox ?? {
    width: image.width,
    height: image.height,
    naturalWidth: image.width,
    naturalHeight: image.height,
  };
  const rect = cropToRenderedRect(cropBox, box);
  const handles = [
    ["nw", "left-0 top-0 -translate-x-1/2 -translate-y-1/2"],
    ["n", "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"],
    ["ne", "right-0 top-0 translate-x-1/2 -translate-y-1/2"],
    ["e", "right-0 top-1/2 translate-x-1/2 -translate-y-1/2"],
    ["se", "bottom-0 right-0 translate-x-1/2 translate-y-1/2"],
    ["s", "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2"],
    ["sw", "bottom-0 left-0 -translate-x-1/2 translate-y-1/2"],
    ["w", "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2"],
  ] as const;

  function beginDrag(mode: string, event: React.PointerEvent<HTMLElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = cropToRenderedRect(cropBox, box);

    function move(pointerEvent: PointerEvent) {
      const dx = (pointerEvent.clientX - startX) / zoom;
      const dy = (pointerEvent.clientY - startY) / zoom;
      const next = { ...startRect };

      if (mode === "move") {
        next.left += dx;
        next.top += dy;
      } else {
        if (mode.includes("w")) {
          next.left += dx;
          next.width -= dx;
        }
        if (mode.includes("e")) next.width += dx;
        if (mode.includes("n")) {
          next.top += dy;
          next.height -= dy;
        }
        if (mode.includes("s")) next.height += dy;
      }

      const normalized = normalizeRenderedRect(next);
      if (normalized.width < 24 || normalized.height < 24) return;
      onChange(renderedRectToCrop(normalized, box));
    }

    function end() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }

  return (
    <div
      className="absolute left-0 top-0"
      data-testid="crop-overlay"
      style={{ width: box.width, height: box.height }}
    >
      <div
        className={`pointer-events-auto absolute bg-emerald-300/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] ${
          needsAi
            ? "border-2 border-dashed border-amber-300"
            : "border-2 border-emerald-300"
        }`}
        data-testid="crop-box"
        onPointerDown={(event) => beginDrag("move", event)}
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          touchAction: "none",
        }}
      >
        {handles.map(([id, className]) => (
          <button
            aria-label={`Crop handle ${id}`}
            className={`pointer-events-auto absolute size-5 rounded-full border-2 border-black bg-emerald-300 transition-shadow duration-150 hover:shadow-[0_0_0_4px_rgba(110,231,183,0.4)] ${className}`}
            key={id}
            onPointerDown={(event) => {
              event.stopPropagation();
              beginDrag(id, event);
            }}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Horizontal scrub dial for rotation angle in degrees. Drag left/right to
 * rotate; tick marks slide under a fixed center indicator. Snaps to 0° within
 * a small dead-zone. Range is clamped to ±45° (use the Crop tool's apply step
 * if you need a 90° re-orient — that's a separate flow we can add later).
 */
function RotationDial({ value, onChange }: { value: number; onChange: (deg: number) => void }) {
  const PIXELS_PER_DEGREE = 4;
  const MIN_DEG = -45;
  const MAX_DEG = 45;
  const VISIBLE_DEGREES = 45; // window: ±22.5° around current value
  const VISIBLE_PX = VISIBLE_DEGREES * PIXELS_PER_DEGREE;
  const startRef = useRef<{ x: number; angle: number } | null>(null);

  function clamp(v: number) {
    if (Math.abs(v) < 0.6) return 0; // snap to zero
    return Math.max(MIN_DEG, Math.min(MAX_DEG, v));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = { x: event.clientX, angle: value };
  }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!startRef.current) return;
    const dx = event.clientX - startRef.current.x;
    onChange(clamp(startRef.current.angle - dx / PIXELS_PER_DEGREE));
  }
  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    startRef.current = null;
  }

  const ticks: React.ReactNode[] = [];
  for (let i = MIN_DEG - 5; i <= MAX_DEG + 5; i++) {
    const x = (i - value) * PIXELS_PER_DEGREE + VISIBLE_PX / 2;
    if (x < -2 || x > VISIBLE_PX + 2) continue;
    const isMajor = i % 10 === 0;
    const isZero = i === 0;
    ticks.push(
      <div
        aria-hidden
        className="pointer-events-none absolute"
        key={i}
        style={{
          left: x,
          top: isMajor ? 4 : 9,
          bottom: isMajor ? 4 : 9,
          width: 1,
          backgroundColor: isZero
            ? "rgb(110, 231, 183)"
            : isMajor
              ? "rgba(255, 255, 255, 0.7)"
              : "rgba(255, 255, 255, 0.3)",
        }}
      />,
    );
  }

  return (
    <div aria-label="Rotation" className="liquid-glass flex items-center gap-3 rounded-full px-3 py-2">
      <div
        aria-valuemax={MAX_DEG}
        aria-valuemin={MIN_DEG}
        aria-valuenow={Math.round(value)}
        className="relative h-7 cursor-ew-resize select-none rounded-full bg-black/30"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="slider"
        style={{ width: VISIBLE_PX, touchAction: "none" }}
      >
        {ticks}
        {/* Fixed center indicator */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 bottom-0 -translate-x-1/2"
          style={{ width: 2, backgroundColor: "rgb(52, 211, 153)" }}
        />
      </div>
      <span className="w-10 text-center font-mono text-sm text-white/80">
        {value > 0 ? "+" : ""}
        {value.toFixed(value % 1 === 0 ? 0 : 1)}°
      </span>
    </div>
  );
}

type EditorTrayProps = {
  adjustmentValue: number;
  cropNeedsAi: boolean;
  cropRotation: number;
  currentImage: ImageAsset | null;
  customPrompt: string;
  job: GenerationJob;
  onApplyCrop: () => void;
  onApplyManualAdjustment: () => void;
  onResetAdjustment: () => void;
  onCloseSubtools: () => void;
  onCustomPromptChange: (value: string) => void;
  onGenerateCustom: () => void;
  onImport: () => void;
  onLocalParams: (label: string, params: AdjustmentParams) => Promise<void>;
  onSelectAction: (id: string) => void;
  onSelectTool: (id: ToolId) => void;
  onSetAdjustmentValue: (value: number) => void;
  onSetCropRotation: (value: number) => void;
  onUseSuggestion: (suggestion: AISuggestion) => void;
  operationVisible: boolean;
  railMode: "tools" | "actions";
  selectedAction?: ToolAction;
  selectedActionId: string;
  selectedToolId: ToolId;
  suggestionSetKey: string;
  suggestions: AISuggestion[];
  tools: typeof enabledTools;
};

function EditorTray(props: EditorTrayProps) {
  const selectedTool = props.tools.find((tool) => tool.id === props.selectedToolId) ?? props.tools[0];

  return (
    <footer data-editor-ui className="pointer-events-auto absolute inset-x-0 bottom-0 z-50 px-3 pb-4 pt-3 md:px-6">
      <div className="pointer-events-auto mx-auto flex max-w-6xl flex-col gap-3">
        {props.operationVisible ? (
          <div className="pointer-events-none relative z-10 px-1">
            <div className="pointer-events-none flex justify-center">
              <div className="pointer-events-none -my-12 max-w-full overflow-x-auto px-14 py-14">
                <div className="pointer-events-auto flex w-max max-w-none flex-col items-center gap-2">
                  <OperationArea selectedTool={selectedTool} {...props} />
                </div>
              </div>
            </div>
            {props.job.status === "error" && props.job.message ? (
              <div className="mt-1 flex justify-center">
                <p aria-live="polite" className="text-sm text-red-300">
                  {props.job.message}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {props.railMode === "actions" && selectedTool.actions.length > 1 ? (
          <ActionRail
            actions={selectedTool.actions}
            onClose={props.onCloseSubtools}
            onSelectAction={props.onSelectAction}
            selectedActionId={props.selectedActionId}
          />
        ) : (
          <ToolRail
            onSelectTool={props.onSelectTool}
            selectedToolId={props.selectedToolId}
            tools={props.tools}
          />
        )}
      </div>
    </footer>
  );
}

function OperationArea({
  cropNeedsAi,
  cropRotation,
  adjustmentValue,
  currentImage,
  customPrompt,
  onApplyCrop,
  onApplyManualAdjustment,
  onResetAdjustment,
  onCustomPromptChange,
  onGenerateCustom,
  onImport,
  onLocalParams,
  onSetAdjustmentValue,
  onSetCropRotation,
  onUseSuggestion,
  selectedAction,
  selectedTool,
  suggestionSetKey,
  suggestions,
}: EditorTrayProps & { selectedTool: (typeof enabledTools)[number] }) {
  if (!currentImage) {
    return (
      <button
        className="spring-hover inline-flex items-center gap-2 rounded-full bg-emerald-300 px-4 py-2 text-sm font-medium text-black shadow-[0_10px_40px_rgba(0,0,0,0.45)] hover:bg-emerald-200 disabled:opacity-35"
        onClick={onImport}
        type="button"
      >
        <Upload size={16} />
        Upload Photo
      </button>
    );
  }

  if (selectedAction?.flow === "system-adjust") {
    if (isManualAdjustment(selectedAction.id)) {
      return (
        <div className="flex items-center gap-2">
          <div className="liquid-glass flex items-center gap-3 rounded-full px-4 py-2">
            <label className="flex items-center gap-3 text-sm text-white/75">
              <span>{selectedAction.label}</span>
              <input
                aria-label={`${selectedAction.label} adjustment`}
                className="w-64 accent-emerald-300 md:w-80"
                max={50}
                min={-50}
                onChange={(event) => onSetAdjustmentValue(Number(event.currentTarget.value))}
                onPointerUp={onApplyManualAdjustment}
                step={1}
                type="range"
                value={adjustmentValue}
              />
            </label>
            <span className="w-10 text-center font-mono text-sm text-white/70">
              {adjustmentValue > 0 ? "+" : ""}
              {adjustmentValue}
            </span>
          </div>
          <button
            aria-label="Reset adjustment"
            className="liquid-glass grid size-10 place-items-center rounded-full text-white/85"
            disabled={adjustmentValue === 0}
            onClick={onResetAdjustment}
            title="Reset"
            type="button"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      );
    }

    return (
      <button
        className="spring-hover rounded-full bg-emerald-300 px-4 py-2 text-sm font-medium text-black shadow-[0_10px_40px_rgba(0,0,0,0.45)] hover:bg-emerald-200 disabled:opacity-35"
        onClick={() => void onLocalParams(selectedAction.label, systemParams(selectedAction.id))}
        type="button"
      >
        Apply {selectedAction.label}
      </button>
    );
  }

  if (selectedAction?.flow === "crop-or-outpaint") {
    return (
      <div className="flex items-center gap-2">
        <RotationDial onChange={onSetCropRotation} value={cropRotation} />
        <button
          className={`spring-hover rounded-full px-4 py-2 text-sm font-medium shadow-[0_10px_40px_rgba(0,0,0,0.45)] disabled:opacity-35 ${
            cropNeedsAi
              ? "bg-amber-300 text-black hover:bg-amber-200"
              : "bg-emerald-300 text-black hover:bg-emerald-200"
          }`}
          onClick={onApplyCrop}
          type="button"
        >
          {cropNeedsAi ? "AI Expand" : "Crop"}
        </button>
      </div>
    );
  }

  if (selectedAction?.requiresInput) {
    return (
      <div className="flex items-center gap-2">
        <input
          className="liquid-glass min-h-11 w-72 rounded-full px-4 text-sm outline-none focus:border-emerald-300 md:w-96"
          onChange={(event) => onCustomPromptChange(event.currentTarget.value)}
          placeholder={`Describe a ${selectedTool.label} edit`}
          value={customPrompt}
        />
        <button
          className="spring-hover rounded-full bg-emerald-300 px-4 py-2 text-sm font-medium text-black shadow-[0_10px_40px_rgba(0,0,0,0.45)] hover:bg-emerald-200 disabled:opacity-35"
          disabled={!customPrompt.trim()}
          onClick={onGenerateCustom}
          type="button"
        >
          Apply
        </button>
      </div>
    );
  }

  if (selectedAction?.requiresSuggestion) {
    return (
      <div className="flex flex-wrap items-center gap-2" key={suggestionSetKey}>
        {suggestions.length === 0
          ? [72, 96, 80, 108, 64].map((width, index) => (
              <span
                aria-hidden
                className="skeleton-pulse h-9 rounded-full bg-white/10"
                key={index}
                style={{ width, animationDelay: `${index * 140}ms` }}
              />
            ))
          : suggestions.map((suggestion, index) => (
              <button
                className="pop-in liquid-glass rounded-full px-4 py-2 text-sm text-white/85"
                key={suggestion.id}
                onClick={() => onUseSuggestion(suggestion)}
                style={{ animationDelay: `${index * 30}ms` }}
                type="button"
              >
                {suggestion.label}
              </button>
            ))}
      </div>
    );
  }

  if (selectedTool.id === "hd") {
    return (
      <button
        className="spring-hover rounded-full bg-emerald-300 px-4 py-2 text-sm font-medium text-black shadow-[0_10px_40px_rgba(0,0,0,0.45)] hover:bg-emerald-200 disabled:opacity-35"
        onClick={() =>
          onUseSuggestion({
            id: "enhance",
            label: "HD Enhance",
            prompt: "increase clarity and natural detail",
          })
        }
        type="button"
      >
        Enhance
      </button>
    );
  }

  return <p className="text-sm text-white/60">Select an operation.</p>;
}

function ToolRail({
  onSelectTool,
  selectedToolId,
  tools,
}: {
  onSelectTool: (id: ToolId) => void;
  selectedToolId: ToolId;
  tools: typeof enabledTools;
}) {
  return (
    <nav aria-label="Editor tools" className="pointer-events-auto -my-12 flex justify-center overflow-x-auto px-12 py-12">
      <div className="pointer-events-auto flex w-max min-w-full justify-center gap-1.5">
      {tools.map((tool, index) => {
        const Icon = iconMap[tool.icon as keyof typeof iconMap] ?? Circle;
        const active = tool.id === selectedToolId;
        return (
          <button
            className="pop-in rail-button flex min-w-20 flex-col items-center gap-2 text-xs text-white/70"
            key={tool.id}
            onClick={() => onSelectTool(tool.id)}
            style={{ animationDelay: `${index * 30}ms` }}
            type="button"
          >
            <span
              className={`grid size-14 place-items-center rounded-full ${
                active
                  ? "border border-emerald-300 bg-emerald-300 text-black"
                  : "liquid-glass-static text-white"
              }`}
            >
              <Icon size={22} />
            </span>
            {tool.label}
          </button>
        );
      })}
      </div>
    </nav>
  );
}

function ActionRail({
  actions,
  onClose,
  onSelectAction,
  selectedActionId,
}: {
  actions: ToolAction[];
  onClose: () => void;
  onSelectAction: (id: string) => void;
  selectedActionId: string;
}) {
  return (
    <nav aria-label="Subtools" className="pointer-events-auto -my-12 flex items-center justify-center overflow-x-auto px-12 py-12">
      <div className="pointer-events-auto flex w-max min-w-full items-end justify-center gap-1.5">
      <button
        aria-label="Close"
        className="pop-in rail-button flex min-w-10 flex-col items-center gap-2 self-end pb-5 text-white/55 hover:text-white/85"
        onClick={onClose}
        style={{ animationDelay: "0ms" }}
        title="Close"
        type="button"
      >
        <span className="liquid-glass-static grid size-8 place-items-center rounded-full">
          <X size={14} />
        </span>
      </button>
      {actions.map((action, index) => {
        const active = action.id === selectedActionId;
        const Icon = action.icon ? iconMap[action.icon as keyof typeof iconMap] : undefined;
        return (
          <button
            className="pop-in rail-button flex min-w-20 flex-col items-center gap-2 text-xs text-white/70"
            key={action.id}
            onClick={() => onSelectAction(action.id)}
            style={{ animationDelay: `${(index + 1) * 30}ms` }}
            type="button"
          >
            <span
              className={`grid size-14 place-items-center rounded-full text-sm font-semibold ${
                active
                  ? "border border-emerald-300 bg-emerald-300 text-black"
                  : "liquid-glass-static text-white"
              }`}
            >
              {Icon ? <Icon size={22} /> : action.label.slice(0, 2)}
            </span>
            {action.label}
          </button>
        );
      })}
      </div>
    </nav>
  );
}

function HistoryStack({
  history,
  historyIndex,
  isOpen,
  onOpenChange,
  onRestore,
}: {
  history: EditOperation[];
  historyIndex: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (index: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemSize = 64;
  const gap = 6;
  const maxItems = 12;
  const current = history[historyIndex] ?? history[0];

  const fanItems = history
    .map((operation, index) => ({ operation, index }))
    .filter(({ index }) => index !== historyIndex)
    .sort((a, b) => b.index - a.index)
    .slice(0, maxItems);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const node = containerRef.current;
      if (node && !node.contains(event.target as Node)) onOpenChange(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [isOpen, onOpenChange]);

  if (!current) return null;

  const stackPreview = history
    .filter((_, index) => index !== historyIndex)
    .slice(-2)
    .reverse();

  return (
    <div
      ref={containerRef}
      data-editor-ui
      className="pointer-events-auto absolute bottom-32 left-4 z-50 md:bottom-36 md:left-6"
    >
      <div className="relative" style={{ width: itemSize, height: itemSize }}>
        {!isOpen
          ? stackPreview.map((operation, layer) => {
              const depth = layer + 1;
              const seed = hashSeed(operation.id);
              const rotation = ((seed % 1000) / 1000 - 0.5) * 14;
              const offsetX = depth * 6 + (((seed >> 5) % 100) / 100 - 0.5) * 4;
              const offsetY = -depth * 6 + (((seed >> 11) % 100) / 100 - 0.5) * 4;
              return (
                <div
                  aria-hidden
                  className="absolute inset-0 overflow-hidden rounded-xl border border-white/15 bg-black/40 shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-opacity duration-200"
                  key={operation.id}
                  style={{
                    transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg) scale(${1 - depth * 0.05})`,
                    transformOrigin: "50% 100%",
                    opacity: 0.9 - depth * 0.18,
                    zIndex: -depth,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                    src={operation.image.dataUrl}
                  />
                </div>
              );
            })
          : null}

        {fanItems.map(({ operation, index }, position) => {
          const offsetIndex = position + 1;
          // macOS Dock-style arc fan: items unfold along a circular arc that
          // starts straight up from the dock button (-90°) and curves gently
          // to the right as the index grows.
          const baseRadius = itemSize + gap; // distance of the first item
          const radiusStep = itemSize * 1.05; // each subsequent item further out
          const angleStep = 3; // degrees per item — small = subtle right lean
          const radius = baseRadius + (offsetIndex - 1) * radiusStep;
          const angleDeg = -90 + (offsetIndex - 1) * angleStep;
          const angleRad = (angleDeg * Math.PI) / 180;
          const targetX = Math.cos(angleRad) * radius;
          const targetY = Math.sin(angleRad) * radius;
          // Items tilt along the arc tangent so the row reads like a fan,
          // not a row of upright tiles.
          const tilt = angleDeg + 90;
          const isOriginal = index === 0;
          const openDelay = `${offsetIndex * 32}ms`;
          const closeDelay = `${(fanItems.length - offsetIndex) * 18}ms`;
          return (
            <button
              aria-label={isOriginal ? "Restore original" : `Restore: ${operation.label}`}
              className="liquid-glass-static absolute inset-0 overflow-hidden rounded-xl transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(0.22,1.2,0.36,1)]"
              key={operation.id}
              onClick={() => {
                onRestore(index);
                onOpenChange(false);
              }}
              style={{
                transform: isOpen
                  ? `translate(${targetX}px, ${targetY}px) rotate(${tilt}deg) scale(1)`
                  : "translate(0, 0) rotate(0deg) scale(0.55)",
                transformOrigin: "50% 50%",
                opacity: isOpen ? 1 : 0,
                pointerEvents: isOpen ? "auto" : "none",
                transitionDelay: isOpen ? openDelay : closeDelay,
                zIndex: 5 - position,
              }}
              title={isOriginal ? "Original" : operation.label}
              type="button"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
                src={operation.image.dataUrl}
              />
              {isOriginal ? (
                <span className="absolute inset-x-0 bottom-0 bg-black/65 py-0.5 text-center text-[10px] text-white/85">
                  Original
                </span>
              ) : null}
            </button>
          );
        })}

        <button
          aria-label="Image history"
          className="spring-hover relative z-10 grid h-full w-full place-items-center"
          onClick={() => onOpenChange(!isOpen)}
          title="Image history"
          type="button"
        >
          <div
            className={`liquid-glass-static h-full w-full overflow-hidden rounded-xl ${
              isOpen ? "!border-emerald-300" : ""
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Current history item"
              className="h-full w-full object-cover"
              draggable={false}
              src={current.image.dataUrl}
            />
          </div>
          <span className="pointer-events-none absolute -right-1.5 -top-1.5 grid size-5 min-w-5 place-items-center rounded-full bg-emerald-300 px-1 text-[10px] font-semibold text-black shadow-[0_4px_12px_rgba(0,0,0,0.45)]">
            {history.length > 99 ? "99+" : history.length}
          </span>
        </button>
      </div>
    </div>
  );
}

type ZoomNavigatorProps = {
  image: ImageAsset;
  onNavigate: (nx: number, ny: number) => void;
  onResetView: () => void;
  onZoomChange: (zoom: number) => void;
  viewport: { left: number; top: number; width: number; height: number };
  zoom: number;
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.2;

function ZoomNavigator({
  image,
  onNavigate,
  onResetView,
  onZoomChange,
  viewport,
  zoom,
}: ZoomNavigatorProps) {
  const minimapWidth = 96;
  const minimapHeight = Math.round((minimapWidth * image.height) / image.width);

  function handleMinimapPointer(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    onNavigate(Math.min(1, Math.max(0, nx)), Math.min(1, Math.max(0, ny)));
  }

  return (
    <div data-editor-ui className="pointer-events-auto absolute bottom-32 right-4 z-50 flex flex-col items-end gap-1.5 md:bottom-36 md:right-6">
      {zoom > 1 ? (
        <div className="liquid-glass-static overflow-hidden rounded-lg p-1">
          <div
            className="relative cursor-crosshair overflow-hidden rounded"
            onPointerDown={handleMinimapPointer}
            style={{ width: minimapWidth, height: minimapHeight, touchAction: "none" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Navigator"
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
              src={image.dataUrl}
            />
            <div
              className="absolute rounded-[1px] border border-emerald-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
              style={{
                left: `${viewport.left * 100}%`,
                top: `${viewport.top * 100}%`,
                width: `${viewport.width * 100}%`,
                height: `${viewport.height * 100}%`,
              }}
            />
          </div>
        </div>
      ) : null}
      <div className="liquid-glass-static flex items-center gap-0.5 rounded-full px-1 py-0.5">
        <button
          aria-label="Zoom out"
          className="spring-hover grid size-6 place-items-center rounded-full text-white/85 hover:bg-white/10 disabled:opacity-35"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => onZoomChange(Math.max(MIN_ZOOM, Math.round((zoom - ZOOM_STEP) * 100) / 100))}
          title="Zoom out"
          type="button"
        >
          <Minus size={12} />
        </button>
        <input
          aria-label="Zoom"
          className="w-16 accent-emerald-300"
          max={MAX_ZOOM * 100}
          min={MIN_ZOOM * 100}
          onChange={(event) => onZoomChange(Number(event.currentTarget.value) / 100)}
          step={1}
          type="range"
          value={Math.round(zoom * 100)}
        />
        <button
          aria-label="Zoom in"
          className="spring-hover grid size-6 place-items-center rounded-full text-white/85 hover:bg-white/10 disabled:opacity-35"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => onZoomChange(Math.min(MAX_ZOOM, Math.round((zoom + ZOOM_STEP) * 100) / 100))}
          title="Zoom in"
          type="button"
        >
          <Plus size={12} />
        </button>
        <span className="w-7 text-center font-mono text-[10px] text-white/65">
          {Math.round(zoom * 100)}
        </span>
        <button
          aria-label="Reset view"
          className="spring-hover grid size-6 place-items-center rounded-full text-white/85 hover:bg-white/10"
          onClick={onResetView}
          title="Reset view"
          type="button"
        >
          <Maximize2 size={12} />
        </button>
      </div>
    </div>
  );
}
