import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { ffmpegBin, ffprobeBin } from "@/lib/audio/binaries";

const execFileAsync = promisify(execFile);

const ALLOWED_EXT = new Set([".wav", ".mp3", ".m4a"]);

export interface AudioValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  durationSec?: number;
  sampleRate?: number;
  channels?: number;
  peakDb?: number;
  meanVolumeDb?: number;
}

export function checkExtension(filename: string): string | null {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return `Μη επιτρεπτός τύπος αρχείου (${ext || "άγνωστος"}). Επιτρέπονται: wav, mp3, m4a.`;
  }
  return null;
}

export function checkFileSize(
  sizeBytes: number,
  maxMb: number,
  label: string
): string | null {
  const max = maxMb * 1024 * 1024;
  if (sizeBytes <= 0) {
    return `Το αρχείο «${label}» είναι κενό.`;
  }
  if (sizeBytes > max) {
    return `Το αρχείο «${label}» υπερβαίνει το όριο των ${maxMb}MB.`;
  }
  return null;
}

interface FfprobeFormat {
  duration?: string;
  bit_rate?: string;
}

interface FfprobeStream {
  codec_type?: string;
  sample_rate?: string;
  channels?: number;
}

async function ffprobe(filePath: string): Promise<{
  durationSec: number;
  sampleRate?: number;
  channels?: number;
}> {
  const { stdout } = await execFileAsync(
    ffprobeBin(),
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,sample_rate,channels",
      "-of",
      "json",
      filePath,
    ],
    { timeout: 60_000 }
  );
  const data = JSON.parse(stdout) as {
    format?: FfprobeFormat;
    streams?: FfprobeStream[];
  };
  const durationSec = Number(data.format?.duration ?? 0);
  const audio = (data.streams || []).find((s) => s.codec_type === "audio");
  return {
    durationSec,
    sampleRate: audio?.sample_rate ? Number(audio.sample_rate) : undefined,
    channels: audio?.channels,
  };
}

async function measureVolumes(filePath: string): Promise<{
  meanVolumeDb: number;
  peakDb: number;
}> {
  try {
    const { stderr } = await execFileAsync(
      ffmpegBin(),
      ["-i", filePath, "-af", "volumedetect", "-f", "null", "-"],
      { timeout: 120_000 }
    );
    const meanMatch = /mean_volume:\s*([-0-9.]+)\s*dB/.exec(stderr);
    const maxMatch = /max_volume:\s*([-0-9.]+)\s*dB/.exec(stderr);
    return {
      meanVolumeDb: meanMatch ? Number(meanMatch[1]) : -90,
      peakDb: maxMatch ? Number(maxMatch[1]) : -90,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // ffmpeg writes analysis to stderr even on "failure" exit sometimes
    const meanMatch = /mean_volume:\s*([-0-9.]+)\s*dB/.exec(msg);
    const maxMatch = /max_volume:\s*([-0-9.]+)\s*dB/.exec(msg);
    if (meanMatch || maxMatch) {
      return {
        meanVolumeDb: meanMatch ? Number(meanMatch[1]) : -90,
        peakDb: maxMatch ? Number(maxMatch[1]) : -90,
      };
    }
    throw err;
  }
}

/**
 * Validate an audio file for silence / clipping / duration.
 * Greek error messages for the UI.
 */
export async function validateAudioFile(
  filePath: string,
  opts: {
    label: string;
    minDurationSec?: number;
    maxDurationSec?: number;
    /** voice: strict clipping errors. song: mastered mixes often peak ~0 dB — warn only. */
    kind?: "voice" | "song";
  }
): Promise<AudioValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let meta;
  try {
    meta = await ffprobe(filePath);
  } catch {
    return {
      ok: false,
      errors: [
        `Δεν ήταν δυνατή η ανάγνωση του αρχείου «${opts.label}». Βεβαιωθείτε ότι είναι έγκυρο wav/mp3/m4a.`,
      ],
      warnings: [],
    };
  }

  if (!meta.durationSec || meta.durationSec < 0.4) {
    errors.push(
      `Το αρχείο «${opts.label}» είναι πολύ σύντομο ή άκυρο (διάρκεια ${meta.durationSec?.toFixed?.(2) ?? 0}s).`
    );
  }

  if (opts.minDurationSec && meta.durationSec < opts.minDurationSec) {
    errors.push(
      `Το αρχείο «${opts.label}» πρέπει να είναι τουλάχιστον ${opts.minDurationSec}s.`
    );
  }
  if (opts.maxDurationSec && meta.durationSec > opts.maxDurationSec) {
    errors.push(
      `Το αρχείο «${opts.label}» υπερβαίνει τα ${opts.maxDurationSec}s.`
    );
  }

  let volumes = { meanVolumeDb: -90, peakDb: -90 };
  try {
    volumes = await measureVolumes(filePath);
  } catch {
    warnings.push(
      `Δεν έγινε πλήρης ανάλυση έντασης για «${opts.label}». Συνεχίζουμε με βασικό έλεγχο.`
    );
  }

  // Near-silence
  if (volumes.meanVolumeDb < -55 && volumes.peakDb < -35) {
    errors.push(
      `Το αρχείο «${opts.label}» φαίνεται σιωπηλό ή πολύ χαμηλής έντασης. Ηχογραφήστε πιο δυνατά σε ήσυχο χώρο.`
    );
  }

  // Clipping — strict for voice samples; songs/mastered mixes often peak at 0 dB.
  const kind = opts.kind ?? "voice";
  if (volumes.peakDb >= -0.2) {
    const msg = `Το αρχείο «${opts.label}» έχει πολύ υψηλή κορυφή (peak ${volumes.peakDb.toFixed(1)} dB).`;
    if (kind === "song") {
      warnings.push(
        `${msg} Σε mastered τραγούδια είναι συχνά φυσιολογικό — συνεχίζουμε. Αν ακούγεται στρεβλωμένο, κατεβάστε λίγο την ένταση.`
      );
    } else {
      errors.push(
        `Το αρχείο «${opts.label}» έχει clipping (κορεσμό). Μειώστε την ένταση εγγραφής και ξαναδοκιμάστε.`
      );
    }
  } else if (volumes.peakDb >= -1.0 && kind !== "song") {
    warnings.push(
      `Το αρχείο «${opts.label}» είναι κοντά στο clipping. Προτιμήστε λίγο χαμηλότερη ένταση.`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    durationSec: meta.durationSec,
    sampleRate: meta.sampleRate,
    channels: meta.channels,
    peakDb: volumes.peakDb,
    meanVolumeDb: volumes.meanVolumeDb,
  };
}

export async function validateVoiceSamples(
  paths: string[],
  filenames: string[]
): Promise<AudioValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let totalDuration = 0;

  if (paths.length < 1 || paths.length > 8) {
    return {
      ok: false,
      errors: ["Ανεβάστε από 1 έως 8 δείγματα φωνής."],
      warnings: [],
    };
  }

  for (let i = 0; i < paths.length; i++) {
    const r = await validateAudioFile(paths[i], {
      label: filenames[i] || `δείγμα ${i + 1}`,
      minDurationSec: 1,
      maxDurationSec: 300,
      kind: "voice",
    });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    totalDuration += r.durationSec || 0;
  }

  if (totalDuration < 30) {
    errors.push(
      `Συνολική διάρκεια δειγμάτων: ${totalDuration.toFixed(0)}s. Χρειάζεστε τουλάχιστον ~30s (ιδανικά 30–180s).`
    );
  } else if (totalDuration > 180) {
    warnings.push(
      `Συνολική διάρκεια ${totalDuration.toFixed(0)}s — πάνω από ~180s σπάνια βελτιώνει το αποτέλεσμα για reference-only μετατροπή.`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    durationSec: totalDuration,
  };
}
