import { enabledTools } from "@/lib/tools";
import type { AISuggestion, EditorTool, ImageAsset, SuggestionGroup, SuggestionTarget } from "@/lib/types";

export function suggestionCacheKey(imageId: string, toolId: string, actionId: string) {
  return `${imageId}:${toolId}:${actionId}`;
}

export function collectBatchSuggestionTargets(tools: EditorTool[] = enabledTools): SuggestionTarget[] {
  return tools.flatMap((tool) =>
    tool.actions
      .filter((action) => action.requiresSuggestion)
      .map((action) => ({
        toolId: tool.id,
        actionId: action.id,
        label: action.label,
        flow: action.flow,
      })),
  );
}

export function normalizeSuggestionGroups(
  image: ImageAsset,
  groups: SuggestionGroup[],
): Record<string, AISuggestion[]> {
  return Object.fromEntries(
    groups.map((group) => [
      suggestionCacheKey(image.id, group.toolId, group.actionId),
      group.suggestions,
    ]),
  );
}

export function getCachedSuggestions(
  cache: Record<string, AISuggestion[]>,
  image: ImageAsset | null,
  toolId: string,
  actionId: string,
) {
  if (!image) return [];
  return cache[suggestionCacheKey(image.id, toolId, actionId)] ?? [];
}
