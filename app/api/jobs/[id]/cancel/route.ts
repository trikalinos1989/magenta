import { NextRequest, NextResponse } from "next/server";
import { getJob, setStep, updateJob, toPublicJob } from "@/lib/jobs/store";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json(
      { error: "Η εργασία δεν βρέθηκε." },
      { status: 404 }
    );
  }
  if (job.status === "succeeded" || job.status === "failed") {
    return NextResponse.json(toPublicJob(job));
  }
  updateJob(id, { canceled: true });
  setStep(id, "canceled", job.progress, {
    status: "canceled",
    finishedAt: new Date().toISOString(),
  });
  return NextResponse.json(toPublicJob(getJob(id)!));
}
