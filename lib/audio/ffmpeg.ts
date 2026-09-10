import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || "/usr/bin/ffmpeg";

async function runFfmpeg(args: string[]): Promise<void> {
  try {
    await execFileAsync(FFMPEG, ["-y", ...args], {
      timeout: 10 * 60_000,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(
      `ffmpeg απέτυχε: ${(e.stderr || e.message || String(err)).slice(-800)}`
    );
  }
}

/** Concatenate several voice samples into one reference WAV. */
export async function concatAudioFiles(
  inputs: string[],
  outputWav: string
): Promise<string> {
  if (inputs.length === 1) {
    await runFfmpeg([
      "-i",
      inputs[0],
      "-ac",
      "1",
      "-ar",
      "44100",
      outputWav,
    ]);
    return outputWav;
  }
  const listContent = inputs
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  const listPath = outputWav + ".txt";
  const fs = await import("fs/promises");
  await fs.writeFile(listPath, listContent);
  await runFfmpeg([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-ac",
    "1",
    "-ar",
    "44100",
    outputWav,
  ]);
  return outputWav;
}

/**
 * Mix converted vocal + instrumental with volume offsets (dB),
 * loudness-normalize, and export WAV + MP3.
 */
export async function mixAndExport(opts: {
  vocalPath: string;
  instrumentalPath?: string | null;
  outWav: string;
  outMp3: string;
  vocalVolumeDb?: number;
  instrumentalVolumeDb?: number;
}): Promise<{ wav: string; mp3: string }> {
  const vGain = opts.vocalVolumeDb ?? 0;
  const iGain = opts.instrumentalVolumeDb ?? 0;

  if (!opts.instrumentalPath) {
    // Vocal-only: normalize and export
    await runFfmpeg([
      "-i",
      opts.vocalPath,
      "-af",
      `volume=${vGain}dB,loudnorm=I=-14:TP=-1.5:LRA=11`,
      "-ar",
      "44100",
      opts.outWav,
    ]);
  } else {
    // amix after per-input volume
    const filter = `[0:a]volume=${vGain}dB[v];[1:a]volume=${iGain}dB[i];[v][i]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[m];[m]loudnorm=I=-14:TP=-1.5:LRA=11[out]`;
    await runFfmpeg([
      "-i",
      opts.vocalPath,
      "-i",
      opts.instrumentalPath,
      "-filter_complex",
      filter,
      "-map",
      "[out]",
      "-ar",
      "44100",
      opts.outWav,
    ]);
  }

  await runFfmpeg([
    "-i",
    opts.outWav,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "320k",
    opts.outMp3,
  ]);

  return { wav: opts.outWav, mp3: opts.outMp3 };
}

export async function toWavMono44k(
  input: string,
  outputWav: string
): Promise<string> {
  await runFfmpeg(["-i", input, "-ac", "1", "-ar", "44100", outputWav]);
  return outputWav;
}

export function basenameSafe(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "_");
}
