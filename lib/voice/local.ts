import fs from "fs/promises";
import path from "path";
import { LOCAL_AI_URL } from "@/lib/ai/local";

export interface LocalVoiceConversionInput {
  sourceVocalPath: string;
  referenceAudioPath: string;
  outDir: string;
  pitch?: number;
  onLog?: (msg: string) => void;
}

export interface LocalVoiceConversionResult {
  convertedPath: string;
  provider: "local-mvp" | "local-seedvc";
  model: string;
  raw: unknown;
}

/**
 * Voice conversion via local FastAPI (Seed-VC when ready, else MVP).
 */
export async function convertVoiceLocal(
  input: LocalVoiceConversionInput
): Promise<LocalVoiceConversionResult> {
  input.onLog?.(
    "Τοπική μετατροπή φωνής (Seed-VC αν είναι διαθέσιμο — αργό στο CPU)…"
  );

  const src = await fs.readFile(input.sourceVocalPath);
  const ref = await fs.readFile(input.referenceAudioPath);
  const form = new FormData();
  form.append(
    "source_vocal",
    new Blob([src], { type: "audio/wav" }),
    "source_vocal.wav"
  );
  form.append(
    "reference_audio",
    new Blob([ref], { type: "audio/wav" }),
    "reference.wav"
  );
  form.append("pitch", String(input.pitch ?? 0));

  let res: Response;
  try {
    // First Seed-VC run downloads multi-GB weights; CPU inference is very slow.
    res = await fetch(`${LOCAL_AI_URL}/convert`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(3 * 60 * 60 * 1000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort|timeout|fetch failed/i.test(msg)) {
      throw new Error(
        "Η τοπική μετατροπή κόπηκε (timeout/σύνδεση). Κράτα ανοιχτό το local-ai (port 8765). " +
          "Η πρώτη φορά κατεβάζει μοντέλα HuggingFace και στο AMD/CPU μπορεί να πάρει πολύ ώρα."
      );
    }
    throw err;
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail || j.error || detail;
    } catch {
      /* ignore */
    }
    throw new Error(`Τοπική μετατροπή απέτυχε: ${detail}`);
  }

  const data = (await res.json()) as {
    converted_b64?: string;
    mode?: string;
    quality_note?: string;
    provider?: string;
  };

  if (!data.converted_b64) {
    throw new Error("Η τοπική υπηρεσία δεν επέστρεψε converted_b64.");
  }

  await fs.mkdir(input.outDir, { recursive: true });
  const convertedPath = path.join(input.outDir, "converted_vocal.wav");
  await fs.writeFile(convertedPath, Buffer.from(data.converted_b64, "base64"));

  if (data.quality_note) {
    input.onLog?.(data.quality_note);
  }

  const isSeed = (data.mode || "").includes("seed") || data.provider === "local-seedvc";
  return {
    convertedPath,
    provider: isSeed ? "local-seedvc" : "local-mvp",
    model: data.mode || "mvp-pitch",
    raw: data,
  };
}
