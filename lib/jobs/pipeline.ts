import path from "path";
import { concatAudioFiles, mixAndExport } from "@/lib/audio/ffmpeg";
import {
  validateAudioFile,
  validateVoiceSamples,
} from "@/lib/audio/validate";
import { getJob, setStep, updateJob } from "@/lib/jobs/store";
import { jobDir, jobPath, downloadToFile } from "@/lib/storage";
import { separateStems } from "@/lib/stems/demucs";
import { convertVoice } from "@/lib/voice/provider";
import { isReplicateConfigured } from "@/lib/replicate-client";

function assertNotCanceled(jobId: string) {
  const job = getJob(jobId);
  if (!job || job.canceled || job.status === "canceled") {
    throw new CancelError();
  }
}

class CancelError extends Error {
  constructor() {
    super("canceled");
    this.name = "CancelError";
  }
}

/**
 * Background pipeline runner. Fire-and-forget from the API route.
 */
export async function runJobPipeline(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;

  try {
    if (!isReplicateConfigured()) {
      setStep(jobId, "failed", 0, {
        error:
          "Λείπει το REPLICATE_API_TOKEN. Προσθέστε το στο .env.local και επανεκκινήστε τον server.",
        finishedAt: new Date().toISOString(),
      });
      return;
    }

    updateJob(jobId, {
      status: "running",
      startedAt: new Date().toISOString(),
    });
    setStep(jobId, "validating", 5);
    assertNotCanceled(jobId);

    const dir = jobDir(jobId);
    const samples = job.artifacts.voiceSamplePaths || [];
    const sampleNames = samples.map((p) => path.basename(p));

    const voiceCheck = await validateVoiceSamples(samples, sampleNames);
    if (!voiceCheck.ok) {
      setStep(jobId, "failed", 0, {
        error: voiceCheck.errors.join(" "),
        finishedAt: new Date().toISOString(),
      });
      return;
    }

    // Resolve song
    let songPath = job.artifacts.songPath;
    if (!songPath && job.artifacts.songUrl) {
      setStep(jobId, "uploading", 10);
      songPath = jobPath(jobId, "song_from_url.wav");
      await downloadToFile(job.artifacts.songUrl, songPath);
      updateJob(jobId, {
        artifacts: { ...getJob(jobId)!.artifacts, songPath },
      });
    }
    if (!songPath) {
      setStep(jobId, "failed", 0, {
        error: "Δεν βρέθηκε αρχείο τραγουδιού.",
        finishedAt: new Date().toISOString(),
      });
      return;
    }

    const songCheck = await validateAudioFile(songPath, {
      label: "τραγούδι",
      minDurationSec: 3,
      maxDurationSec: 60 * 12,
      kind: "song",
    });
    if (!songCheck.ok) {
      setStep(jobId, "failed", 0, {
        error: songCheck.errors.join(" "),
        finishedAt: new Date().toISOString(),
      });
      return;
    }

    assertNotCanceled(jobId);

    // Build reference audio from samples
    const referencePath = path.join(dir, "voice_reference.wav");
    await concatAudioFiles(samples, referencePath);

    let vocalsPath: string;
    let instrumentalPath: string | undefined;

    if (job.params.isAcapella) {
      setStep(jobId, "separating", 25, {
        // skip demucs
      });
      vocalsPath = songPath;
      instrumentalPath = undefined;
      updateJob(jobId, {
        artifacts: {
          ...getJob(jobId)!.artifacts,
          vocalsPath,
        },
      });
    } else {
      setStep(jobId, "separating", 20);
      const stems = await separateStems({
        songPath,
        outDir: dir,
        onLog: (msg) =>
          updateJob(jobId, {
            stepLabel: `Διαχωρισμός: ${msg}`,
          }),
      });
      assertNotCanceled(jobId);
      vocalsPath = stems.vocalsPath;
      instrumentalPath = stems.instrumentalPath;
      updateJob(jobId, {
        artifacts: {
          ...getJob(jobId)!.artifacts,
          vocalsPath,
          instrumentalPath,
        },
        progress: 45,
      });
    }

    assertNotCanceled(jobId);
    setStep(jobId, "converting", 55);

    const vc = await convertVoice({
      sourceVocalPath: vocalsPath,
      referenceAudioPath: referencePath,
      outDir: dir,
      pitch: job.params.pitch,
      indexRate: job.params.indexRate,
      protect: job.params.protect,
      customRvcModelUrl: job.params.customRvcModelUrl,
      onLog: (msg) =>
        updateJob(jobId, {
          stepLabel: `Μετατροπή: ${msg}`,
        }),
    });

    assertNotCanceled(jobId);
    updateJob(jobId, {
      artifacts: {
        ...getJob(jobId)!.artifacts,
        convertedVocalPath: vc.convertedPath,
      },
      providerUsed: vc.provider,
      modelUsed: vc.model,
      progress: 75,
    });

    setStep(jobId, "mixing", 80);
    const outWav = path.join(dir, "mix.wav");
    const outMp3 = path.join(dir, "mix.mp3");

    await mixAndExport({
      vocalPath: vc.convertedPath,
      instrumentalPath: instrumentalPath,
      outWav,
      outMp3,
      vocalVolumeDb: job.params.vocalVolumeDb,
      instrumentalVolumeDb: job.params.instrumentalVolumeDb,
    });

    assertNotCanceled(jobId);
    setStep(jobId, "exporting", 95);

    updateJob(jobId, {
      artifacts: {
        ...getJob(jobId)!.artifacts,
        mixWavPath: outWav,
        mixMp3Path: outMp3,
      },
    });

    setStep(jobId, "done", 100, {
      status: "succeeded",
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof CancelError || (err as Error)?.name === "CancelError") {
      setStep(jobId, "canceled", getJob(jobId)?.progress ?? 0, {
        status: "canceled",
        finishedAt: new Date().toISOString(),
      });
      return;
    }
    const message =
      err instanceof Error ? err.message : "Άγνωστο σφάλμα στη διοχέτευση.";
    setStep(jobId, "failed", getJob(jobId)?.progress ?? 0, {
      status: "failed",
      error: message,
      finishedAt: new Date().toISOString(),
    });
  }
}
