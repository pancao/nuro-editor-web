import type { PromptTemplate } from "@/lib/types";

export type PromptVars = Record<string, string | number | object | undefined>;

export function renderPrompt(template: PromptTemplate, vars: PromptVars) {
  const missing = new Set<string>();
  const rendered = template.template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    if (value === undefined || value === "") {
      missing.add(key);
      return "";
    }
    return typeof value === "string" ? value : JSON.stringify(value);
  });

  if (missing.size > 0) {
    throw new Error(`Missing prompt variables: ${Array.from(missing).join(", ")}`);
  }

  return rendered;
}
