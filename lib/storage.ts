import fs from "fs/promises";
import path from "path";
import { existsSync, mkdirSync, createReadStream } from "fs";

/** Local MVP storage root. Prefer /tmp/foni-mou, fall back to project .data */
export const STORAGE_ROOT =
  process.env.FONI_MOU_DATA_DIR ||
  (existsSync("/tmp") ? "/tmp/foni-mou" : path.join(process.cwd(), ".data"));

export function ensureStorage() {
  mkdirSync(STORAGE_ROOT, { recursive: true });
}

export function jobDir(jobId: string): string {
  const dir = path.join(STORAGE_ROOT, "jobs", jobId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function jobPath(jobId: string, ...parts: string[]): string {
  return path.join(jobDir(jobId), ...parts);
}

export async function writeBuffer(
  jobId: string,
  filename: string,
  data: Buffer
): Promise<string> {
  const full = jobPath(jobId, filename);
  await fs.writeFile(full, data);
  return full;
}

export async function readBuffer(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

export function openReadStream(filePath: string) {
  return createReadStream(filePath);
}

export async function downloadToFile(
  url: string,
  destPath: string
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Αποτυχία λήψης αρχείου (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buf);
  return destPath;
}

export function publicFileUrl(jobId: string, filename: string): string {
  return `/api/files/${jobId}/${encodeURIComponent(filename)}`;
}
