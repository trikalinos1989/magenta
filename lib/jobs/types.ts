export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export type JobStepId =
  | "queued"
  | "validating"
  | "uploading"
  | "separating"
  | "converting"
  | "mixing"
  | "exporting"
  | "done"
  | "failed"
  | "canceled";

export const STEP_LABELS_EL: Record<JobStepId, string> = {
  queued: "Σε ουρά…",
  validating: "Έλεγχος αρχείων…",
  uploading: "Μεταφόρτωση…",
  separating: "Διαχωρισμός φωνής / οργανικού…",
  converting: "Μετατροπή φωνής…",
  mixing: "Μίξη & κανονικοποίηση…",
  exporting: "Εξαγωγή WAV / MP3…",
  done: "Ολοκληρώθηκε",
  failed: "Απέτυχε",
  canceled: "Ακυρώθηκε",
};

export interface JobParams {
  pitch: number; // -12..+12
  indexRate: number; // 0..1
  protect: number; // 0..0.5
  vocalVolumeDb: number;
  instrumentalVolumeDb: number;
  isAcapella: boolean;
  customRvcModelUrl?: string;
}

export interface JobArtifacts {
  voiceSamplePaths: string[];
  songPath?: string;
  songUrl?: string;
  vocalsPath?: string;
  instrumentalPath?: string;
  convertedVocalPath?: string;
  mixWavPath?: string;
  mixMp3Path?: string;
}

export interface JobRecord {
  id: string;
  status: JobStatus;
  step: JobStepId;
  stepLabel: string;
  progress: number; // 0..100
  error?: string;
  consentAt: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  canceled: boolean;
  params: JobParams;
  artifacts: JobArtifacts;
  providerUsed?: string;
  modelUsed?: string;
}

export type PublicJob = Omit<JobRecord, "artifacts"> & {
  artifacts: {
    voiceSampleUrls: string[];
    songUrl?: string;
    vocalsUrl?: string;
    instrumentalUrl?: string;
    convertedVocalUrl?: string;
    mixWavUrl?: string;
    mixMp3Url?: string;
  };
};
