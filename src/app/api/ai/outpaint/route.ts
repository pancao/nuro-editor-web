import { NextResponse } from "next/server";
import { outpaintImage } from "@/lib/ai/provider";
import { jsonError } from "@/lib/api-response";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    return NextResponse.json(await outpaintImage(payload));
  } catch (error) {
    return jsonError(error);
  }
}
