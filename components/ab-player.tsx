"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TrackKey = "original" | "converted" | "mix";

const LABELS: Record<TrackKey, string> = {
  original: "Αρχική φωνή",
  converted: "Μετατρεπόμενη",
  mix: "Τελική μίξη",
};

export function ABPlayer({
  originalUrl,
  convertedUrl,
  mixUrl,
}: {
  originalUrl?: string;
  convertedUrl?: string;
  mixUrl?: string;
}) {
  const tracks: Partial<Record<TrackKey, string>> = {
    ...(originalUrl ? { original: originalUrl } : {}),
    ...(convertedUrl ? { converted: convertedUrl } : {}),
    ...(mixUrl ? { mix: mixUrl } : {}),
  };
  const keys = Object.keys(tracks) as TrackKey[];
  const [active, setActive] = useState<TrackKey>(
    keys.includes("mix") ? "mix" : keys[0]
  );

  if (!keys.length) {
    return (
      <p className="text-sm text-zinc-500">Δεν υπάρχουν ακόμα προεπισκοπήσεις.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {keys.map((k) => (
          <Button
            key={k}
            size="sm"
            variant={active === k ? "default" : "secondary"}
            onClick={() => setActive(k)}
            className={cn(active === k && "ring-1 ring-amber-300")}
          >
            {LABELS[k]}
          </Button>
        ))}
      </div>
      <audio
        key={active}
        controls
        className="w-full"
        src={tracks[active]}
        preload="metadata"
      />
    </div>
  );
}
