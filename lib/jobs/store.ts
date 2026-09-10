import {
  JobRecord,
  JobStepId,
  PublicJob,
  STEP_LABELS_EL,
} from "@/lib/jobs/types";
import { publicFileUrl } from "@/lib/storage";
import path from "path";

/**
 * In-memory job store for MVP.
 * Note: resets on server restart / cold start — acceptable for local MVP.
 */
const jobs = new Map<string, JobRecord>();

export function createJob(job: JobRecord): JobRecord {
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): JobRecord | undefined {
  return jobs.get(id);
}

export function updateJob(
  id: string,
  patch: Partial<JobRecord>
): JobRecord | undefined {
  const cur = jobs.get(id);
  if (!cur) return undefined;
  const next: JobRecord = {
    ...cur,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (patch.step) {
    next.stepLabel = STEP_LABELS_EL[patch.step as JobStepId] || patch.step;
  }
  jobs.set(id, next);
  return next;
}

export function setStep(
  id: string,
  step: JobStepId,
  progress: number,
  extra?: Partial<JobRecord>
) {
  return updateJob(id, {
    step,
    progress,
    status: step === "failed" ? "failed" : step === "canceled" ? "canceled" : step === "done" ? "succeeded" : "running",
    stepLabel: STEP_LABELS_EL[step],
    ...extra,
  });
}

export function listJobs(): JobRecord[] {
  return Array.from(jobs.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

function fileUrl(jobId: string, filePath?: string): string | undefined {
  if (!filePath) return undefined;
  return publicFileUrl(jobId, path.basename(filePath));
}

export function toPublicJob(job: JobRecord): PublicJob {
  const a = job.artifacts;
  return {
    ...job,
    artifacts: {
      voiceSampleUrls: (a.voiceSamplePaths || []).map((p) =>
        publicFileUrl(job.id, path.basename(p))
      ),
      songUrl: a.songUrl || fileUrl(job.id, a.songPath),
      vocalsUrl: fileUrl(job.id, a.vocalsPath),
      instrumentalUrl: fileUrl(job.id, a.instrumentalPath),
      convertedVocalUrl: fileUrl(job.id, a.convertedVocalPath),
      mixWavUrl: fileUrl(job.id, a.mixWavPath),
      mixMp3Url: fileUrl(job.id, a.mixMp3Path),
    },
  };
}
