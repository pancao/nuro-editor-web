import { NextResponse } from "next/server";
import { getParams } from "@/lib/ai/provider";
import { jsonError } from "@/lib/api-response";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    return NextResponse.json(await getParams(payload));
  } catch (error) {
    return jsonError(error);
  }
}
