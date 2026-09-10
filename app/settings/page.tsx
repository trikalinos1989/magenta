"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle2, XCircle } from "lucide-react";

export default function SettingsPage() {
  const [status, setStatus] = useState<{
    replicateConfigured: boolean;
    falConfigured: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/settings/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() =>
        setStatus({ replicateConfigured: false, falConfigured: false })
      );
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ρυθμίσεις</h1>
        <p className="text-sm text-zinc-400">
          Κατάσταση API κλειδιών. Το raw key δεν εμφανίζεται ποτέ.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Replicate</CardTitle>
          <CardDescription>
            Απαραίτητο για Demucs και voice conversion.
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
            <p className="font-medium text-zinc-200">Ρύθμιση</p>
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
              Χωρίς token η εφαρμογή δεν επιστρέφει ψεύτικα αρχεία ήχου — μόνο
              μήνυμα ρύθμισης.
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
}: {
  label: string;
  ok?: boolean;
  optional?: boolean;
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
          <CheckCircle2 className="h-4 w-4" /> ρυθμισμένο
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-sm text-amber-400">
          <XCircle className="h-4 w-4" /> λείπει
        </span>
      )}
    </div>
  );
}
