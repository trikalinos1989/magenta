"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ABPlayer } from "@/components/ab-player";
import { formatDuration } from "@/lib/utils";

interface PublicJob {
  id: string;
  status: string;
  stepLabel: string;
  progress: number;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  consentAt: string;
  providerUsed?: string;
  modelUsed?: string;
  artifacts: {
    vocalsUrl?: string;
    instrumentalUrl?: string;
    convertedVocalUrl?: string;
    mixWavUrl?: string;
    mixMp3Url?: string;
  };
}

export default function JobResultPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [job, setJob] = useState<PublicJob | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Not found");
        if (alive) setJob(data);
      } catch (e) {
        if (alive)
          setErr(e instanceof Error ? e.message : "Σφάλμα φόρτωσης.");
      }
    };
    load();
    const iv = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [id]);

  if (err) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-red-300">{err}</p>
        <Button asChild>
          <Link href="/app">Νέο take</Link>
        </Button>
      </div>
    );
  }

  if (!job) {
    return (
      <p className="mx-auto max-w-2xl text-sm text-zinc-500">Φόρτωση…</p>
    );
  }

  const running =
    job.status === "running" || job.status === "queued";
  const start = job.startedAt || job.createdAt;
  const elapsed = formatDuration(
    (job.finishedAt ? new Date(job.finishedAt).getTime() : now) -
      new Date(start).getTime()
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Αποτέλεσμα</h1>
          <p className="text-sm text-zinc-500">Job {job.id}</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/app">Νέο take</Link>
        </Button>
      </div>

      {(running || job.status === "failed" || job.status === "canceled") && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex justify-between text-sm">
              <span className="text-amber-200">{job.stepLabel}</span>
              <span className="text-zinc-500">{elapsed}</span>
            </div>
            <Progress value={job.progress} />
            {job.error && (
              <p className="text-sm text-red-300">{job.error}</p>
            )}
            {running && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" })
                }
              >
                Ακύρωση
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {job.status === "succeeded" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>A/B ακρόαση</CardTitle>
              <CardDescription>
                Συγκρίνετε αρχική φωνή, μετατρεπόμενη και τελική μίξη.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ABPlayer
                originalUrl={job.artifacts.vocalsUrl}
                convertedUrl={job.artifacts.convertedVocalUrl}
                mixUrl={job.artifacts.mixWavUrl || job.artifacts.mixMp3Url}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Λήψεις</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {job.artifacts.mixWavUrl && (
                <Button asChild>
                  <a href={job.artifacts.mixWavUrl} download>
                    Λήψη WAV
                  </a>
                </Button>
              )}
              {job.artifacts.mixMp3Url && (
                <Button asChild variant="secondary">
                  <a href={job.artifacts.mixMp3Url} download>
                    Λήψη MP3
                  </a>
                </Button>
              )}
              {job.artifacts.convertedVocalUrl && (
                <Button asChild variant="outline">
                  <a href={job.artifacts.convertedVocalUrl} download>
                    Μόνο φωνή
                  </a>
                </Button>
              )}
              {job.artifacts.instrumentalUrl && (
                <Button asChild variant="outline">
                  <a href={job.artifacts.instrumentalUrl} download>
                    Οργανικό
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-1 p-6 text-xs text-zinc-500">
              <p>Συναίνεση: {new Date(job.consentAt).toLocaleString("el-GR")}</p>
              {job.providerUsed && <p>Provider: {job.providerUsed}</p>}
              {job.modelUsed && (
                <p className="break-all">Model: {job.modelUsed}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
