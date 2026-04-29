import { NextResponse } from "next/server";

export function jsonError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return NextResponse.json({ error: message }, { status });
}
