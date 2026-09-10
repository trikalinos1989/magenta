import path from "path";
import { runReplicate } from "@/lib/replicate-client";
import { downloadToFile, openReadStream } from "@/lib/storage";
import { ffmpegBin } from "@/lib/audio/binaries";

/**
 * Voice conversion provider abstraction.
 *
 * Prefer zero-shot / reference-audio VC on Replicate (FreeVC).
 * Fallback: zsxkib/realistic-voice-cloning only when a custom RVC .zip/.pth URL
 * is provided (requires a trained RVC model — not invented locally).
 */

export const FREEVC_MODEL = "jagilley/free-vc" as const;
export const FREEVC_VERSION =
  process.env.FREEVC_VERSION ||
  "e4f2ff8a1d3779a2411e119dfad7d451d5f3314a8cd7003a88f88ce4c3b18d95";

export const RVC_MODEL = "zsxkib/realistic-voice-cloning" as const;
export const RVC_VERSION =
  process.env.RVC_VERSION ||
  "0a9c7c558af4c0f20667c1bd1260ce32a2879944a0b9e44e1398660c077b1550";

export interface VoiceConversionInput {
  /** Isolated source vocals to convert */
  sourceVocalPath: string;
  /** Concatenated reference of the user's voice */
  referenceAudioPath: string;
  outDir: string;
  pitch?: number; // semitones -12..+12
  indexRate?: number; // 0..1 (RVC)
  protect?: number; // 0..0.5 (RVC)
  customRvcModelUrl?: string;
  onLog?: (msg: string) => void;
}

export interface VoiceConversionResult {
  convertedPath: string;
  provider: "free-vc" | "rvc-custom";
  model: string;
  raw: unknown;
}

function extractAudioUrl(output: unknown): string {
  if (typeof output === "string" && output.startsWith("http")) return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const u = extractAudioUrl(item);
      if (u) return u;
    }
  }
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    for (const key of [
      "audio",
      "url",
      "output",
      "wav",
      "mp3",
      "vocals",
      "file",
    ]) {
      const v = o[key];
      if (typeof v === "string" && (v.startsWith("http") || v.startsWith("data:"))) {
        return v;
      }
    }
    // FileOutput-like
    if (typeof (o as { url?: () => string }).url === "function") {
      const u = (o as { url: () => string }).url();
      if (u) return u;
    }
    // cover pipeline may return { song_uri, ... } or nested
    for (const v of Object.values(o)) {
      if (typeof v === "string" && v.startsWith("http")) return v;
    }
  }
  throw new Error(
    "Το μοντέλο μετατροπής φωνής δεν επέστρεψε URL ήχου."
  );
}

async function runFreeVc(
  input: VoiceConversionInput
): Promise<VoiceConversionResult> {
  input.onLog?.(
    "Zero-shot μετατροπή με FreeVC (reference audio)…"
  );

  const payload = {
    source_audio: openReadStream(input.sourceVocalPath) as unknown as string,
    reference_audio: openReadStream(
      input.referenceAudioPath
    ) as unknown as string,
    model_type: "FreeVC (24kHz)",
  };

  let output: unknown;
  try {
    output = await runReplicate(
      `${FREEVC_MODEL}:${FREEVC_VERSION}` as `${string}/${string}:${string}`,
      { input: payload }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|Too Many Requests|throttled|rate limit|περιορίσε/i.test(msg)) {
      throw err;
    }
    input.onLog?.("Επανάληψη FreeVC χωρίς pin έκδοσης…");
    output = await runReplicate(FREEVC_MODEL as `${string}/${string}`, {
      input: payload,
    });
  }

  const url = extractAudioUrl(output);
  const convertedPath = path.join(input.outDir, "converted_vocal.wav");
  await downloadToFile(url, convertedPath);

  return {
    convertedPath,
    provider: "free-vc",
    model: `${FREEVC_MODEL}:${FREEVC_VERSION}`,
    raw: output,
  };
}

/**
 * Map UI pitch (-12..+12) to RVC pitch_change enum + pitch_change_all.
 * FreeVC has no pitch slider — pitch applied later via ffmpeg if needed.
 */
function mapPitchToRvc(pitch: number): {
  pitch_change: "no-change" | "male-to-female" | "female-to-male";
  pitch_change_all: number;
} {
  if (pitch >= 8) return { pitch_change: "male-to-female", pitch_change_all: pitch - 12 };
  if (pitch <= -8)
    return { pitch_change: "female-to-male", pitch_change_all: pitch + 12 };
  return { pitch_change: "no-change", pitch_change_all: pitch };
}

async function runCustomRvc(
  input: VoiceConversionInput
): Promise<VoiceConversionResult> {
  if (!input.customRvcModelUrl?.trim()) {
    throw new Error("Απαιτείται URL για custom RVC μοντέλο.");
  }
  input.onLog?.(
    "Fallback: zsxkib/realistic-voice-cloning με custom RVC model…"
  );

  const pitch = input.pitch ?? 0;
  const { pitch_change, pitch_change_all } = mapPitchToRvc(pitch);

  const payload = {
    song_input: openReadStream(input.sourceVocalPath) as unknown as string,
    rvc_model: "CUSTOM",
    custom_rvc_model_download_url: input.customRvcModelUrl.trim(),
    pitch_change,
    pitch_change_all,
    index_rate: input.indexRate ?? 0.5,
    protect: input.protect ?? 0.33,
    pitch_detection_algorithm: "rmvpe",
    output_format: "wav",
    // Keep reverb dry — we mix ourselves
    reverb_size: 0,
    reverb_wetness: 0,
    reverb_dryness: 1,
    main_vocals_volume_change: 0,
    instrumental_volume_change: -60,
    backup_vocals_volume_change: -60,
  };

  let output: unknown;
  try {
    output = await runReplicate(
      `${RVC_MODEL}:${RVC_VERSION}` as `${string}/${string}:${string}`,
      { input: payload }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|Too Many Requests|throttled|rate limit|περιορίσε/i.test(msg)) {
      throw err;
    }
    input.onLog?.("Επανάληψη RVC χωρίς pin έκδοσης…");
    output = await runReplicate(RVC_MODEL as `${string}/${string}`, {
      input: payload,
    });
  }

  const url = extractAudioUrl(output);
  const convertedPath = path.join(input.outDir, "converted_vocal.wav");
  await downloadToFile(url, convertedPath);

  return {
    convertedPath,
    provider: "rvc-custom",
    model: `${RVC_MODEL}:${RVC_VERSION}`,
    raw: output,
  };
}

/**
 * Apply pitch shift with ffmpeg when the zero-shot model lacks a pitch control.
 */
export async function applyPitchShift(
  inputPath: string,
  outputPath: string,
  semitones: number
): Promise<string> {
  if (!semitones) return inputPath;
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);
  const factor = Math.pow(2, semitones / 12);
  // rubberband if available, else asetrate+aresample approximation
  try {
    await execFileAsync(
      ffmpegBin(),
      [
        "-y",
        "-i",
        inputPath,
        "-af",
        `rubberband=pitch=${factor}`,
        outputPath,
      ],
      { timeout: 300_000 }
    );
    return outputPath;
  } catch {
    await execFileAsync(
      ffmpegBin(),
      [
        "-y",
        "-i",
        inputPath,
        "-af",
        `asetrate=44100*${factor},aresample=44100`,
        outputPath,
      ],
      { timeout: 300_000 }
    );
    return outputPath;
  }
}

export async function convertVoice(
  input: VoiceConversionInput
): Promise<VoiceConversionResult> {
  if (input.customRvcModelUrl?.trim()) {
    return runCustomRvc(input);
  }

  const result = await runFreeVc(input);

  if (input.pitch && input.pitch !== 0) {
    input.onLog?.(`Εφαρμογή pitch ${input.pitch} ημιτόνια…`);
    const pitched = path.join(input.outDir, "converted_vocal_pitched.wav");
    result.convertedPath = await applyPitchShift(
      result.convertedPath,
      pitched,
      input.pitch
    );
  }

  return result;
}
