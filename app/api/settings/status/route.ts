import { NextResponse } from "next/server";
import { isReplicateConfigured } from "@/lib/replicate-client";
import {
  LOCAL_AI_URL,
  checkLocalHealth,
  configuredProvider,
} from "@/lib/ai/local";

export const runtime = "nodejs";

export async function GET() {
  const local = await checkLocalHealth();
  return NextResponse.json({
    replicateConfigured: isReplicateConfigured(),
    falConfigured: Boolean(process.env.FAL_KEY?.trim()),
    aiProvider: configuredProvider(),
    localAiUrl: LOCAL_AI_URL,
    localAi: {
      online: local.ok,
      device: local.device ?? null,
      demucsReady: local.demucs_ready ?? null,
      vcReady: local.vc_ready ?? null,
      vcMode: local.vc_mode ?? null,
      qualityNote: local.quality_note ?? null,
      error: local.error ?? null,
    },
  });
}
