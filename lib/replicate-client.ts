import Replicate from "replicate";

export function isReplicateConfigured(): boolean {
  return Boolean(process.env.REPLICATE_API_TOKEN?.trim());
}

export function getReplicate(): Replicate {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Λείπει το REPLICATE_API_TOKEN. Ρυθμίστε το στο .env.local."
    );
  }
  return new Replicate({ auth: token });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimited(err: unknown): { retryAfterMs: number } | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (!/429|Too Many Requests|throttled|rate limit/i.test(msg)) return null;
  const m = /retry_after["\s:]*([0-9]+)|resets in ~([0-9]+)s/i.exec(msg);
  const sec = Number(m?.[1] || m?.[2] || 12);
  return { retryAfterMs: Math.max(sec, 3) * 1000 + 500 };
}

/**
 * Run a Replicate model with retries on 429 (common on unpaid accounts).
 */
export async function runReplicate(
  model: `${string}/${string}` | `${string}/${string}:${string}`,
  options: Parameters<Replicate["run"]>[1],
  label = "Replicate"
): Promise<unknown> {
  const replicate = getReplicate();
  const maxAttempts = 5;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await replicate.run(model, options);
    } catch (err) {
      lastErr = err;
      const rl = isRateLimited(err);
      if (!rl || attempt === maxAttempts) break;
      const wait = rl.retryAfterMs * attempt;
      console.warn(
        `[${label}] 429 rate limit — retry ${attempt}/${maxAttempts} in ${Math.round(wait / 1000)}s`
      );
      await sleep(wait);
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  if (/429|Too Many Requests|throttled|rate limit/i.test(msg)) {
    throw new Error(
      "Το Replicate περιόρισε τα αιτήματα (429). Χωρίς payment method το όριο είναι ~6/λεπτό. Περίμενε λίγα δευτερόλεπτα και ξαναδοκίμασε, ή πρόσθεσε κάρτα στο replicate.com/account/billing."
    );
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
