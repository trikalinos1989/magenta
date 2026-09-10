"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function SetupBanner() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/settings/status")
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.replicateConfigured)))
      .catch(() => setConfigured(false));
  }, []);

  if (configured !== false) return null;

  return (
    <Card className="border-amber-500/40 bg-amber-500/10">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-medium text-amber-100">
              Λείπει το REPLICATE_API_TOKEN
            </p>
            <p className="text-zinc-400">
              Χωρίς πραγματικό API token δεν τρέχουν μετατροπές — δεν υπάρχουν
              dummy ήχοι. Δημιουργήστε token στο replicate.com και προσθέστε το
              στο <code className="text-amber-200">.env.local</code>.
            </p>
          </div>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/settings">Οδηγίες ρύθμισης</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
