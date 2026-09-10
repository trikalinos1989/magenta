import fs from "fs/promises";
import path from "path";
import { LOCAL_AI_URL } from "@/lib/ai/local";
import type { StemResult } from "@/lib/stems/demucs";

/**
 * Stem separation via local FastAPI Demucs (CPU).
 */
export async function separateStemsLocal(opts: {
  songPath: string;
  outDir: string;
  onLog?: (msg: string) => void;
}): Promise<StemResult> {
  opts.onLog?.("Τοπικό Demucs (CPU)…");

  const buf = await fs.readFile(opts.songPath);
  const form = new FormData();
  form.append(
    "audio",
    new Blob([buf], { type: "audio/wav" }),
    path.basename(opts.songPath) || "song.wav"
  );

  const res = await fetch(`${LOCAL_AI_URL}/stems`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60 * 60 * 1000),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail || j.error || detail;
    } catch {
      /* ignore */
    }
    throw new Error(`Τοπικό Demucs απέτυχε: ${detail}`);
  }

  const data = (await res.json()) as {
    vocals_b64?: string;
    instrumental_b64?: string;
    mode?: string;
    device?: string;
  };

  if (!data.vocals_b64 || !data.instrumental_b64) {
    throw new Error(
      "Η τοπική υπηρεσία δεν επέστρεψε vocals/instrumental (base64)."
    );
  }

  await fs.mkdir(opts.outDir, { recursive: true });
  const vocalsPath = path.join(opts.outDir, "vocals.wav");
  const instrumentalPath = path.join(opts.outDir, "instrumental.wav");
  await fs.writeFile(vocalsPath, Buffer.from(data.vocals_b64, "base64"));
  await fs.writeFile(
    instrumentalPath,
    Buffer.from(data.instrumental_b64, "base64")
  );

  opts.onLog?.(
    `Τοπικά στελέχη έτοιμα (${data.mode || "demucs"}, ${data.device || "cpu"})`
  );

  return {
    vocalsPath,
    instrumentalPath,
    raw: data,
  };
}
