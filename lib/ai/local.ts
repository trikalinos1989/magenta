/**
 * Local AI (FastAPI on 127.0.0.1:8765) discovery + provider selection.
 */

export const LOCAL_AI_URL = (
  process.env.LOCAL_AI_URL || "http://127.0.0.1:8765"
).replace(/\/$/, "");

export type AiProviderMode = "local" | "replicate" | "auto";

export function configuredProvider(): AiProviderMode {
  const raw = (process.env.AI_PROVIDER || "auto").trim().toLowerCase();
  if (raw === "local" || raw === "replicate" || raw === "auto") return raw;
  return "auto";
}

export interface LocalHealth {
  ok: boolean;
  device?: string;
  demucs_ready?: boolean;
  vc_ready?: boolean;
  vc_mode?: string;
  quality_note?: string;
  error?: string;
}

export async function checkLocalHealth(
  timeoutMs = 2500
): Promise<LocalHealth> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${LOCAL_AI_URL}/health`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as LocalHealth;
    return {
      ok: Boolean(data.ok),
      device: data.device,
      demucs_ready: data.demucs_ready,
      vc_ready: data.vc_ready,
      vc_mode: data.vc_mode,
      quality_note: data.quality_note,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Resolve which backend to use for a job.
 * - local: require healthy local AI
 * - replicate: cloud only
 * - auto: local if healthy, else replicate (if token present)
 */
export async function resolveAiProvider(): Promise<{
  provider: "local" | "replicate";
  local: LocalHealth;
}> {
  const mode = configuredProvider();
  const local = await checkLocalHealth();

  if (mode === "local") {
    if (!local.ok) {
      throw new Error(
        "AI_PROVIDER=local αλλά η τοπική υπηρεσία δεν απαντά στο " +
          `${LOCAL_AI_URL}/health. Ξεκινήστε το local-ai\\start.bat.`
      );
    }
    return { provider: "local", local };
  }

  if (mode === "replicate") {
    return { provider: "replicate", local };
  }

  // auto
  if (local.ok && local.demucs_ready !== false && local.vc_ready !== false) {
    return { provider: "local", local };
  }
  return { provider: "replicate", local };
}
