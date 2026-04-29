import { NextResponse } from "next/server";
import { generateImage } from "@/lib/ai/provider";
import { jsonError } from "@/lib/api-response";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    return NextResponse.json(await generateImage(payload));
  } catch (error) {
    return jsonError(error);
  }
}
