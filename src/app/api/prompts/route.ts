import { NextResponse } from "next/server";
import { promptTemplates } from "@/lib/prompts";

export async function GET() {
  return NextResponse.json({ prompts: promptTemplates });
}
