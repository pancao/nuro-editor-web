import { notFound } from "next/navigation";
import { PromptLab } from "@/components/prompt-lab";

export default function PromptLabPage() {
  const enabled =
    process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_PROMPT_LAB === "true";

  if (!enabled) {
    notFound();
  }

  return <PromptLab />;
}
