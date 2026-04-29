import { NextResponse } from "next/server";
import { maskAISettings } from "@/lib/ai-settings";
import { jsonError } from "@/lib/api-response";
import { getSuggestions } from "@/lib/ai/provider";
import { getPromptTemplate } from "@/lib/prompts";
import { renderPrompt } from "@/lib/prompt-render";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const template = getPromptTemplate(payload.promptTemplateId);

    if (!template) {
      return NextResponse.json({ error: "Prompt template not found" }, { status: 404 });
    }

    const renderedPrompt = renderPrompt(template, payload.variables ?? {});
    const aiResponse = await getSuggestions({
      image: payload.image,
      aiSettings: payload.aiSettings,
      toolId: template.toolId,
      actionId: payload.actionId,
      prompt: renderedPrompt,
      context: payload.context,
    });

    return NextResponse.json({
      request: {
        template,
        variables: payload.variables,
        renderedPrompt,
        aiSettings: maskAISettings(payload.aiSettings),
      },
      raw: aiResponse,
      parsed: aiResponse,
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
