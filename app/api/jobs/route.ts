import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  checkExtension,
  checkFileSize,
} from "@/lib/audio/validate";
import { createJob, listJobs, toPublicJob } from "@/lib/jobs/store";
import { runJobPipeline } from "@/lib/jobs/pipeline";
import { JobParams, JobRecord, STEP_LABELS_EL } from "@/lib/jobs/types";
import { ensureStorage, writeBuffer, jobDir } from "@/lib/storage";
import { isReplicateConfigured } from "@/lib/replicate-client";
import { basenameSafe } from "@/lib/audio/ffmpeg";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    jobs: listJobs().slice(0, 50).map(toPublicJob),
  });
}

export async function POST(req: NextRequest) {
  ensureStorage();

  if (!isReplicateConfigured()) {
    return NextResponse.json(
      {
        error:
          "Λείπει το REPLICATE_API_TOKEN. Δείτε /settings για οδηγίες ρύθμισης.",
        code: "MISSING_REPLICATE_TOKEN",
      },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Μη έγκυρο multipart αίτημα." },
      { status: 400 }
    );
  }

  const consent = String(form.get("consent") || "");
  if (consent !== "true" && consent !== "1" && consent !== "on") {
    return NextResponse.json(
      {
        error:
          "Απαιτείται συναίνεση: κλωνάρετε ΜΟΝΟ τη δική σας φωνή ή φωνή με γραπτή άδεια.",
      },
      { status: 400 }
    );
  }

  const consentAt = new Date().toISOString();
  const isAcapella =
    String(form.get("isAcapella") || "") === "true" ||
    String(form.get("isAcapella") || "") === "1";

  const params: JobParams = {
    pitch: clampNum(form.get("pitch"), -12, 12, 0),
    indexRate: clampNum(form.get("indexRate"), 0, 1, 0.5),
    protect: clampNum(form.get("protect"), 0, 0.5, 0.33),
    vocalVolumeDb: clampNum(form.get("vocalVolumeDb"), -12, 12, 0),
    instrumentalVolumeDb: clampNum(
      form.get("instrumentalVolumeDb"),
      -12,
      12,
      0
    ),
    isAcapella,
    customRvcModelUrl:
      String(form.get("customRvcModelUrl") || "").trim() || undefined,
  };

  const voiceFiles = form
    .getAll("voiceSamples")
    .filter((f): f is File => typeof f !== "string" && !!f && f.size > 0);

  if (voiceFiles.length < 1 || voiceFiles.length > 8) {
    return NextResponse.json(
      { error: "Ανεβάστε από 1 έως 8 δείγματα φωνής (wav/mp3/m4a)." },
      { status: 400 }
    );
  }

  for (const f of voiceFiles) {
    const extErr = checkExtension(f.name);
    if (extErr) {
      return NextResponse.json({ error: extErr }, { status: 400 });
    }
    const sizeErr = checkFileSize(f.size, 25, f.name);
    if (sizeErr) {
      return NextResponse.json({ error: sizeErr }, { status: 400 });
    }
  }

  const songFile = form.get("songFile");
  const songUrl = String(form.get("songUrl") || "").trim();

  const hasSongFile =
    songFile && typeof songFile !== "string" && songFile.size > 0;

  if (!hasSongFile && !songUrl) {
    return NextResponse.json(
      {
        error:
          "Δώστε ένα αρχείο τραγουδιού ή δημόσιο URL ήχου (wav/mp3/m4a).",
      },
      { status: 400 }
    );
  }

  if (songUrl && !/^https?:\/\//i.test(songUrl)) {
    return NextResponse.json(
      { error: "Το URL πρέπει να ξεκινά με http:// ή https://." },
      { status: 400 }
    );
  }

  if (hasSongFile) {
    const sf = songFile as File;
    const extErr = checkExtension(sf.name);
    if (extErr) {
      return NextResponse.json({ error: extErr }, { status: 400 });
    }
    const sizeErr = checkFileSize(sf.size, 40, sf.name);
    if (sizeErr) {
      return NextResponse.json({ error: sizeErr }, { status: 400 });
    }
  }

  const id = randomUUID();
  jobDir(id);

  const voiceSamplePaths: string[] = [];
  for (let i = 0; i < voiceFiles.length; i++) {
    const f = voiceFiles[i];
    const buf = Buffer.from(await f.arrayBuffer());
    const name = `voice_${i}_${basenameSafe(f.name)}`;
    const p = await writeBuffer(id, name, buf);
    voiceSamplePaths.push(p);
  }

  let songPath: string | undefined;
  if (hasSongFile) {
    const sf = songFile as File;
    const buf = Buffer.from(await sf.arrayBuffer());
    songPath = await writeBuffer(id, `song_${basenameSafe(sf.name)}`, buf);
  }

  const now = new Date().toISOString();
  const record: JobRecord = {
    id,
    status: "queued",
    step: "queued",
    stepLabel: STEP_LABELS_EL.queued,
    progress: 0,
    consentAt,
    createdAt: now,
    updatedAt: now,
    canceled: false,
    params,
    artifacts: {
      voiceSamplePaths,
      songPath,
      songUrl: songUrl || undefined,
    },
  };

  createJob(record);

  // Fire and forget — in-memory queue (single process)
  void runJobPipeline(id);

  return NextResponse.json(toPublicJob(record), { status: 201 });
}

function clampNum(
  raw: FormDataEntryValue | null,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
