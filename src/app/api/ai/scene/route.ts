import { NextResponse } from "next/server";
import { getSceneInfo } from "@/lib/ai/provider";
import { jsonError } from "@/lib/api-response";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    return NextResponse.json(await getSceneInfo(payload));
  } catch (error) {
    return jsonError(error);
  }
}
