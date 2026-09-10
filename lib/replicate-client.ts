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
