/** Resolve ffmpeg/ffprobe across Linux, macOS, and Windows. */
export function ffmpegBin(): string {
  if (process.env.FFMPEG_PATH?.trim()) return process.env.FFMPEG_PATH.trim();
  // Prefer PATH lookup — works on Windows (ffmpeg.exe) and Unix.
  return "ffmpeg";
}

export function ffprobeBin(): string {
  if (process.env.FFPROBE_PATH?.trim()) return process.env.FFPROBE_PATH.trim();
  return "ffprobe";
}
