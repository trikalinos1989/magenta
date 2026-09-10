import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { STORAGE_ROOT } from "@/lib/storage";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await ctx.params;
  if (!parts?.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Prevent path traversal
  const safe = parts.map((p) => path.basename(p));
  const full = path.join(STORAGE_ROOT, "jobs", ...safe);
  const resolved = path.resolve(full);
  const root = path.resolve(path.join(STORAGE_ROOT, "jobs"));
  if (!resolved.startsWith(root)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const data = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    return new NextResponse(data, {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
