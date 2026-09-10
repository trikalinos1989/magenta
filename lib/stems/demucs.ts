import fs from "fs/promises";
import path from "path";
import { getReplicate } from "@/lib/replicate-client";
import { downloadToFile, openReadStream } from "@/lib/storage";
import { ffmpegBin } from "@/lib/audio/binaries";

/**
 * Vocal separation via Replicate Demucs (ryan5453/demucs).
 * Version pinned with owner/name fallback.
 */
export const DEMUCS_MODEL = "ryan5453/demucs" as const;
export const DEMUCS_VERSION =
  process.env.DEMUCS_VERSION ||
  "5a7041cc9b82e5a558fea6b3d7b12dea89625e89da33f0447bd727c2d0ab9e77";

export interface StemResult {
  vocalsPath: string;
  instrumentalPath: string;
  raw: unknown;
}

function collectUrls(output: unknown): Record<string, string> {
  const map: Record<string, string> = {};

  const assign = (name: string, url: unknown) => {
    if (typeof url === "string" && url.startsWith("http")) {
      map[name.toLowerCase()] = url;
    } else if (url && typeof url === "object" && "url" in (url as object)) {
      const u = (url as { url: () => string }).url?.() ?? String(url);
      if (typeof u === "string" && u.startsWith("http")) {
        map[name.toLowerCase()] = u;
      }
    } else if (typeof url === "string") {
      map[name.toLowerCase()] = url;
    }
  };

  if (!output) return map;

  // Array of { name, audio }
  if (Array.isArray(output)) {
    for (const item of output) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const name = String(o.name ?? o.stem ?? "stem");
        assign(name, o.audio ?? o.url ?? o.file);
      } else if (typeof item === "string") {
        assign(`stem_${Object.keys(map).length}`, item);
      }
    }
    return map;
  }

  if (typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (Array.isArray(o.stems)) {
      return collectUrls(o.stems);
    }
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" || (v && typeof v === "object")) {
        assign(k, v);
      }
    }
  }

  if (typeof output === "string") {
    assign("vocals", output);
  }

  return map;
}

function pickUrl(
  map: Record<string, string>,
  candidates: string[]
): string | undefined {
  for (const c of candidates) {
    if (map[c]) return map[c];
  }
  // fuzzy
  for (const [k, v] of Object.entries(map)) {
    if (candidates.some((c) => k.includes(c))) return v;
  }
  return undefined;
}

export async function separateStems(opts: {
  songPath: string;
  outDir: string;
  onLog?: (msg: string) => void;
}): Promise<StemResult> {
  const replicate = getReplicate();
  opts.onLog?.("Εκκίνηση Demucs στο Replicate…");

  const input = {
    audio: openReadStream(opts.songPath) as unknown as string,
    model: "htdemucs",
    stem: "none",
    output_format: "wav",
    shifts: 1,
  };

  let output: unknown;
  try {
    output = await replicate.run(
      `${DEMUCS_MODEL}:${DEMUCS_VERSION}` as `${string}/${string}:${string}`,
      { input }
    );
  } catch {
    // Fallback to latest model ref without pin
    opts.onLog?.("Επανάληψη χωρίς pin έκδοσης…");
    output = await replicate.run(DEMUCS_MODEL as `${string}/${string}`, {
      input,
    });
  }

  const urls = collectUrls(output);
  opts.onLog?.(`Στελέχη: ${Object.keys(urls).join(", ") || "(κενό)"}`);

  const vocalsUrl = pickUrl(urls, [
    "vocals",
    "vocal",
    "voice",
    "singing",
  ]);
  let instrumentalUrl = pickUrl(urls, [
    "no_vocals",
    "novocals",
    "instrumental",
    "accompaniment",
    "other",
  ]);

  // If we only got individual stems, leave instrumental URL empty —
  // caller may mix drums+bass+other later. Prefer no_vocals if present.
  if (!instrumentalUrl) {
    const parts = ["drums", "bass", "other", "guitar", "piano"]
      .map((k) => urls[k])
      .filter(Boolean) as string[];
    if (parts.length === 1) {
      instrumentalUrl = parts[0];
    } else if (parts.length > 1) {
      // Download and ffmpeg-amix into instrumental
      const tmpPaths: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const p = path.join(opts.outDir, `stem_part_${i}.wav`);
        await downloadToFile(parts[i], p);
        tmpPaths.push(p);
      }
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);
      const outInst = path.join(opts.outDir, "instrumental.wav");
      const inputs = tmpPaths.flatMap((p) => ["-i", p]);
      const labels = tmpPaths.map((_, i) => `[${i}:a]`).join("");
      const filter = `${labels}amix=inputs=${tmpPaths.length}:duration=longest:normalize=0[out]`;
      await execFileAsync(
        ffmpegBin(),
        ["-y", ...inputs, "-filter_complex", filter, "-map", "[out]", outInst],
        { timeout: 300_000 }
      );
      instrumentalUrl = undefined; // already on disk
      const vocalsPath = path.join(opts.outDir, "vocals.wav");
      if (!vocalsUrl) {
        throw new Error(
          "Το Demucs δεν επέστρεψε φωνητικό στέλεχος (vocals)."
        );
      }
      await downloadToFile(vocalsUrl, vocalsPath);
      return {
        vocalsPath,
        instrumentalPath: outInst,
        raw: output,
      };
    }
  }

  if (!vocalsUrl) {
    throw new Error(
      "Το Demucs δεν επέστρεψε φωνητικό στέλεχος. Δοκιμάστε άλλο αρχείο ή μοντέλο."
    );
  }

  await fs.mkdir(opts.outDir, { recursive: true });
  const vocalsPath = path.join(opts.outDir, "vocals.wav");
  const instrumentalPath = path.join(opts.outDir, "instrumental.wav");
  await downloadToFile(vocalsUrl, vocalsPath);

  if (instrumentalUrl) {
    await downloadToFile(instrumentalUrl, instrumentalPath);
  } else {
    // Create silent placeholder? Better to fail clearly for remix needs —
    // but for acapella path we skip this function. Copy silence of same length via ffmpeg anullsrc is heavy;
    // throw so pipeline can decide.
    throw new Error(
      "Το Demucs δεν επέστρεψε οργανικό στέλεχος (instrumental / no_vocals)."
    );
  }

  return { vocalsPath, instrumentalPath, raw: output };
}
