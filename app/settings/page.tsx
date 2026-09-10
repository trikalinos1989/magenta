"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";

type StatusPayload = {
  replicateConfigured: boolean;
  falConfigured: boolean;
  aiProvider?: string;
  localAiUrl?: string;
  localAi?: {
    online: boolean;
    device: string | null;
    demucsReady: boolean | null;
    vcReady: boolean | null;
    vcMode: string | null;
    qualityNote: string | null;
    error: string | null;
  };
};

export default function SettingsPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/settings/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() =>
        setStatus({
          replicateConfigured: false,
          falConfigured: false,
          localAi: { online: false, device: null, demucsReady: null, vcReady: null, vcMode: null, qualityNote: null, error: "fetch failed" },
        })
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const localOnline = status?.localAi?.online === true;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Ρυθμίσεις</h1>
          <p className="text-sm text-zinc-400">
            Κατάσταση τοπικής AI και API κλειδιών. Το raw key δεν εμφανίζεται ποτέ.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Ανανέωση
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Τοπική AI (Local)</CardTitle>
          <CardDescription>
            FastAPI στο PC σας — Demucs + MVP μετατροπή φωνής (CPU / AMD). Προεπιλογή αν είναι online.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusRow
            label={`Υπηρεσία ${status?.localAiUrl || "http://127.0.0.1:8765"}`}
            ok={status?.localAi?.online}
            okText="online"
            badText="offline"
          />
          <StatusRow
            label={`Συσκευή · ${status?.localAi?.device || "—"}`}
            ok={localOnline}
            optional
          />
          <StatusRow
            label="Demucs έτοιμο"
            ok={status?.localAi?.demucsReady ?? undefined}
            optional
          />
          <StatusRow
            label={`VC έτοιμο (${status?.localAi?.vcMode || "mvp"})`}
            ok={status?.localAi?.vcReady ?? undefined}
            optional
          />
          <StatusRow
            label={`AI_PROVIDER · ${status?.aiProvider || "auto"}`}
            ok={true}
            optional
          />

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400 space-y-2">
            <p className="font-medium text-zinc-200">Εκκίνηση Windows</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Τρέξτε <code className="text-amber-200">local-ai\start.bat</code>
              </li>
              <li>
                Στο <code className="text-amber-200">.env.local</code>:{" "}
                <code className="text-amber-200">LOCAL_AI_URL=http://127.0.0.1:8765</code>
              </li>
              <li>
                Προαιρετικά{" "}
                <code className="text-amber-200">AI_PROVIDER=local</code> ή{" "}
                <code className="text-amber-200">auto</code> (προεπιλογή)
              </li>
            </ol>
            {status?.localAi?.qualityNote ? (
              <p className="pt-2 text-xs text-amber-200/90">
                {status.localAi.qualityNote}
              </p>
            ) : (
              <p className="pt-2 text-xs">
                Η τοπική μετατροπή φωνής είναι MVP (pitch + envelope) — όχι ποιότητα
                FreeVC/RVC. Ο διαχωρισμός Demucs είναι πραγματικός στον CPU.
              </p>
            )}
            {status?.localAi?.error && !localOnline ? (
              <p className="text-xs text-rose-400">Σφάλμα: {status.localAi.error}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Replicate (cloud)</CardTitle>
          <CardDescription>
            Εναλλακτικό cloud backend όταν η τοπική AI είναι offline ή AI_PROVIDER=replicate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusRow
            label="REPLICATE_API_TOKEN"
            ok={status?.replicateConfigured}
          />
          <StatusRow
            label="FAL_KEY (προαιρετικό, μελλοντικό)"
            ok={status?.falConfigured}
            optional
          />

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400 space-y-2">
            <p className="font-medium text-zinc-200">Ρύθμιση cloud</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Δημιουργήστε token στο{" "}
                <a
                  className="text-amber-400 underline"
                  href="https://replicate.com/account/api-tokens"
                  target="_blank"
                  rel="noreferrer"
                >
                  replicate.com/account/api-tokens
                </a>
              </li>
              <li>
                Αντιγράψτε το{" "}
                <code className="text-amber-200">.env.example</code> σε{" "}
                <code className="text-amber-200">.env.local</code>
              </li>
              <li>
                Ορίστε{" "}
                <code className="text-amber-200">
                  REPLICATE_API_TOKEN=r8_…
                </code>
              </li>
              <li>Επανεκκινήστε το <code>npm run dev</code></li>
            </ol>
            <p className="pt-2 text-xs">
              Χωρίς τοπική AI και χωρίς token η εφαρμογή δεν επιστρέφει ψεύτικα
              αρχεία ήχου — μόνο μήνυμα ρύθμισης.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({
  label,
  ok,
  optional,
  okText = "ρυθμισμένο",
  badText = "λείπει",
}: {
  label: string;
  ok?: boolean;
  optional?: boolean;
  okText?: string;
  badText?: string;
}) {
  const known = typeof ok === "boolean";
  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-800 px-3 py-3">
      <span className="text-sm">
        {label}
        {optional ? (
          <span className="text-zinc-500"> · optional</span>
        ) : null}
      </span>
      {!known ? (
        <span className="text-xs text-zinc-500">έλεγχος…</span>
      ) : ok ? (
        <span className="inline-flex items-center gap-1 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> {okText}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-sm text-amber-400">
          <XCircle className="h-4 w-4" /> {badText}
        </span>
      )}
    </div>
  );
}
