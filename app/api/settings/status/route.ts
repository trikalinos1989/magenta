import { NextResponse } from "next/server";
import { isReplicateConfigured } from "@/lib/replicate-client";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    replicateConfigured: isReplicateConfigured(),
    falConfigured: Boolean(process.env.FAL_KEY?.trim()),
  });
}
