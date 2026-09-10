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
 * Voice conversion via local FastAPI.
 * Prefers Seed-VC when the local-ai server detects ./seed-vc; else MVP pitch+envelope.
 */
export async function convertVoiceLocal(
  input: LocalVoiceConversionInput
): Promise<LocalVoiceConversionResult> {
  input.onLog?.("Τοπική μετατροπή φωνής (Seed-VC αν είναι διαθέσιμο, αλλιώς MVP)…");

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

  const res = await fetch(`${LOCAL_AI_URL}/convert`, {
    method: "POST",
    body: form,
  });

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

  const mode = data.mode || "mvp-pitch";
  const isSeed =
    mode === "seed-vc" || mode === "seedvc" || mode.startsWith("seed");

  if (isSeed) {
    input.onLog?.(
      "Seed-VC: νευρωνική μετατροπή φωνής (τραγούδι / f0-condition). Στο CPU είναι πολύ αργό — κανονικό."
    );
  } else {
    input.onLog?.(
      "Τοπική μετατροπή φωνής (MVP CPU — όχι ποιότητα Seed-VC/FreeVC/RVC)…"
    );
  }

  if (data.quality_note) {
    input.onLog?.(data.quality_note);
  }

  return {
    convertedPath,
    provider: isSeed ? "local-seedvc" : "local-mvp",
    model: mode,
    raw: data,
  };
}
