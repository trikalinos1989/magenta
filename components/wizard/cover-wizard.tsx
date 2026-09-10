"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { WaveformPreview } from "@/components/waveform-preview";
import { SetupBanner } from "@/components/setup-banner";
import { formatDuration } from "@/lib/utils";

const STEPS = [
  { id: 1, title: "Η φωνή μου" },
  { id: 2, title: "Το τραγούδι μου" },
  { id: 3, title: "Μετατροπή" },
] as const;

const HISTORY_KEY = "foni-mou-job-history";

export function CoverWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [consent, setConsent] = useState(false);
  const [voiceFiles, setVoiceFiles] = useState<File[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [songFile, setSongFile] = useState<File | null>(null);
  const [songUrl, setSongUrl] = useState("");
  const [isAcapella, setIsAcapella] = useState(false);
  const [pitch, setPitch] = useState(0);
  const [indexRate, setIndexRate] = useState(0.5);
  const [protect, setProtect] = useState(0.33);
  const [vocalVol, setVocalVol] = useState(0);
  const [instVol, setInstVol] = useState(0);
  const [customRvc, setCustomRvc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<{
    progress: number;
    stepLabel: string;
    status: string;
    error?: string;
    createdAt?: string;
  } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/settings/status")
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.replicateConfigured)))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    if (!jobId) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = await res.json();
        if (!alive) return;
        setJobStatus({
          progress: data.progress ?? 0,
          stepLabel: data.stepLabel ?? "",
          status: data.status,
          error: data.error,
          createdAt: data.createdAt,
        });
        if (
          data.status === "succeeded" ||
          data.status === "failed" ||
          data.status === "canceled"
        ) {
          if (data.status === "succeeded") {
            pushHistory(jobId);
            router.push(`/app/jobs/${jobId}`);
          }
        }
      } catch {
        /* ignore transient */
      }
    };
    poll();
    const iv = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [jobId, router]);

  const voiceHint = useMemo(() => {
    if (!voiceFiles.length) return "Κανένα δείγμα ακόμα.";
    const totalMb =
      voiceFiles.reduce((s, f) => s + f.size, 0) / (1024 * 1024);
    return `${voiceFiles.length} αρχεία · ~${totalMb.toFixed(1)}MB`;
  }, [voiceFiles]);

  function onVoiceChange(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).slice(0, 8);
    setVoiceFiles(next);
    setPreviewFile(next[0] || null);
    setError(null);
  }

  function canNextFrom1() {
    return consent && voiceFiles.length >= 1 && voiceFiles.length <= 8;
  }

  function canNextFrom2() {
    return Boolean(songFile) || /^https?:\/\//i.test(songUrl.trim());
  }

  async function startJob() {
    setError(null);
    if (!consent) {
      setError("Πρέπει να αποδεχτείτε τη συναίνεση χρήσης φωνής.");
      return;
    }
    if (configured === false) {
      setError(
        "Λείπει το REPLICATE_API_TOKEN. Πηγαίνετε στις Ρυθμίσεις."
      );
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("consent", "true");
      fd.set("isAcapella", String(isAcapella));
      fd.set("pitch", String(pitch));
      fd.set("indexRate", String(indexRate));
      fd.set("protect", String(protect));
      fd.set("vocalVolumeDb", String(vocalVol));
      fd.set("instrumentalVolumeDb", String(instVol));
      if (customRvc.trim()) fd.set("customRvcModelUrl", customRvc.trim());
      for (const f of voiceFiles) fd.append("voiceSamples", f);
      if (songFile) fd.set("songFile", songFile);
      if (songUrl.trim()) fd.set("songUrl", songUrl.trim());

      const res = await fetch("/api/jobs", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Αποτυχία δημιουργίας εργασίας.");
      }
      setJobId(data.id);
      setStartedAt(Date.now());
      setJobStatus({
        progress: data.progress ?? 0,
        stepLabel: data.stepLabel,
        status: data.status,
      });
      pushHistory(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Σφάλμα υποβολής.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelJob() {
    if (!jobId) return;
    await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
  }

  const elapsed =
    startedAt != null ? formatDuration(now - startedAt) : "0:00";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <SetupBanner />

      <div className="flex items-center justify-between gap-2">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={`flex-1 rounded-lg border px-3 py-2 text-center text-sm ${
              step === s.id
                ? "border-amber-500/60 bg-amber-500/10 text-amber-100"
                : "border-zinc-800 text-zinc-500"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider">
              Βήμα {s.id}
            </div>
            <div className="font-medium">{s.title}</div>
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Η φωνή μου</CardTitle>
            <CardDescription>
              Ανεβάστε δείγματα της φωνής σας για reference. Δεν γίνεται τοπικό
              «training» — το μοντέλο χρησιμοποιεί τα δείγματα ως αναφορά
              (zero-shot). Μην περιμένετε μήνυμα «training complete».
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <Checkbox
                id="consent"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
              />
              <Label htmlFor="consent" className="leading-relaxed">
                Κλωνάρω ΜΟΝΟ τη δική μου φωνή / φωνή για την οποία έχω γραπτή
                άδεια.
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="voices">Δείγματα φωνής (1–8, max 25MB το καθένα)</Label>
              <Input
                id="voices"
                type="file"
                accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4"
                multiple
                onChange={(e) => onVoiceChange(e.target.files)}
              />
              <p className="text-xs text-zinc-500">{voiceHint}</p>
            </div>

            <WaveformPreview file={previewFile} />

            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">
              <li>Ήσυχο δωμάτιο, χωρίς αντήχηση (reverb)</li>
              <li>Το τραγούδι δίνει καλύτερο αποτέλεσμα από απλή ομιλία</li>
              <li>Περιλάβετε χαμηλές και υψηλές νότες</li>
              <li>Συνολική διάρκεια ιδανικά 30–180 δευτερόλεπτα</li>
            </ul>

            <div className="flex justify-end">
              <Button disabled={!canNextFrom1()} onClick={() => setStep(2)}>
                Συνέχεια
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Το τραγούδι μου</CardTitle>
            <CardDescription>
              Ένα αρχείο wav/mp3/m4a έως 40MB ή δημόσιο URL ήχου. Αν είναι ήδη
              acapella, ενεργοποιήστε τον διακόπτη για να παραλειφθεί ο
              διαχωρισμός στελεχών.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="song">Αρχείο τραγουδιού</Label>
              <Input
                id="song"
                type="file"
                accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4"
                onChange={(e) => {
                  setSongFile(e.target.files?.[0] || null);
                  setError(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="songUrl">ή δημόσιο URL</Label>
              <Input
                id="songUrl"
                placeholder="https://…"
                value={songUrl}
                onChange={(e) => setSongUrl(e.target.value)}
              />
            </div>
            <WaveformPreview file={songFile} />

            <div className="flex items-center justify-between rounded-lg border border-zinc-800 p-4">
              <div>
                <Label htmlFor="acapella">Το αρχείο είναι ήδη acapella</Label>
                <p className="text-xs text-zinc-500">
                  Παράλειψη Demucs — μόνο μετατροπή φωνής.
                </p>
              </div>
              <Switch
                id="acapella"
                checked={isAcapella}
                onCheckedChange={setIsAcapella}
              />
            </div>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Πίσω
              </Button>
              <Button disabled={!canNextFrom2()} onClick={() => setStep(3)}>
                Συνέχεια
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Μετατροπή</CardTitle>
            <CardDescription>
              Ρυθμίστε pitch / ομοιότητα και ξεκινήστε τη διοχέτευση. Χωρίς
              token δεν τρέχει τίποτα — δεν παράγουμε ψεύτικα audio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <SliderRow
              label={`Pitch (${pitch} ημιτόνια)`}
              value={pitch}
              min={-12}
              max={12}
              step={1}
              onChange={setPitch}
            />
            <SliderRow
              label={`Index / ομοιότητα (${indexRate.toFixed(2)}) — για custom RVC`}
              value={indexRate}
              min={0}
              max={1}
              step={0.01}
              onChange={setIndexRate}
            />
            <SliderRow
              label={`Προστασία συμφώνων (${protect.toFixed(2)}) — για custom RVC`}
              value={protect}
              min={0}
              max={0.5}
              step={0.01}
              onChange={setProtect}
            />
            <SliderRow
              label={`Ένταση φωνής (${vocalVol} dB)`}
              value={vocalVol}
              min={-12}
              max={12}
              step={0.5}
              onChange={setVocalVol}
            />
            <SliderRow
              label={`Ένταση οργανικού (${instVol} dB)`}
              value={instVol}
              min={-12}
              max={12}
              step={0.5}
              onChange={setInstVol}
            />

            <div className="space-y-2">
              <Label htmlFor="rvc">
                Προαιρετικό custom RVC model URL (.zip)
              </Label>
              <Input
                id="rvc"
                placeholder="https://…/my-voice.zip (μόνο αν έχετε δικό σας .pth/.zip)"
                value={customRvc}
                onChange={(e) => setCustomRvc(e.target.value)}
              />
              <p className="text-xs text-zinc-500">
                Χωρίς URL χρησιμοποιείται zero-shot FreeVC με τα δείγματά σας.
                Το RVC fallback ενεργοποιείται μόνο με δικό σας μοντέλο — όχι
                celebrity packs.
              </p>
            </div>

            {error && (
              <p className="rounded-md border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
                {error}
              </p>
            )}

            {jobId && jobStatus && (
              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-200">{jobStatus.stepLabel}</span>
                  <span className="text-zinc-500">Χρόνος {elapsed}</span>
                </div>
                <Progress value={jobStatus.progress} />
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>ID: {jobId.slice(0, 8)}…</span>
                  <span>{jobStatus.progress}%</span>
                </div>
                {jobStatus.error && (
                  <p className="text-sm text-red-300">{jobStatus.error}</p>
                )}
                {jobStatus.status === "running" ||
                jobStatus.status === "queued" ? (
                  <Button variant="destructive" size="sm" onClick={cancelJob}>
                    Ακύρωση
                  </Button>
                ) : null}
              </div>
            )}

            <div className="flex justify-between">
              <Button
                variant="secondary"
                onClick={() => setStep(2)}
                disabled={Boolean(jobId)}
              >
                Πίσω
              </Button>
              <Button
                onClick={startJob}
                disabled={submitting || Boolean(jobId) || configured === false}
              >
                {submitting ? "Υποβολή…" : "Έναρξη μετατροπής"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <Label>{label}</Label>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
    </div>
  );
}

function pushHistory(id: string) {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    const next = [id, ...arr.filter((x) => x !== id)].slice(0, 30);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
