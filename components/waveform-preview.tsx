"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight client-side waveform preview using Web Audio API.
 * Not a full editor — just visual feedback that the file has signal.
 */
export function WaveformPreview({
  file,
  className,
}: {
  file: File | null;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (!file) {
      setDuration(null);
      setError(null);
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext("2d");
        ctx?.clearRect(0, 0, c.width, c.height);
      }
      return;
    }

    let cancelled = false;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const audioCtx = new AudioContext();
        const buf = await audioCtx.decodeAudioData(
          reader.result as ArrayBuffer
        );
        if (cancelled) {
          await audioCtx.close();
          return;
        }
        setDuration(buf.duration);
        setError(null);
        draw(buf);
        await audioCtx.close();
      } catch {
        setError("Αδυναμία προεπισκόπησης κυματομορφής.");
      }
    };
    reader.readAsArrayBuffer(file);

    return () => {
      cancelled = true;
    };
  }, [file]);

  function draw(buf: AudioBuffer) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, width, height);

    const data = buf.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const d = data[i * step + j] ?? 0;
        if (d < min) min = d;
        if (d > max) max = d;
      }
      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();
  }

  return (
    <div className={cn("space-y-1", className)}>
      <canvas
        ref={canvasRef}
        width={640}
        height={64}
        className="h-16 w-full rounded-md border border-zinc-800 bg-zinc-900"
      />
      <div className="flex justify-between text-xs text-zinc-500">
        <span>{file ? file.name : "Χωρίς αρχείο"}</span>
        <span>
          {error
            ? error
            : duration != null
              ? `${duration.toFixed(1)}s`
              : "—"}
        </span>
      </div>
    </div>
  );
}
