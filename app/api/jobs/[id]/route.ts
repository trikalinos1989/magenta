import { NextRequest, NextResponse } from "next/server";
import { getJob, toPublicJob } from "@/lib/jobs/store";

export const runtime = "nodejs";

export async function GET(
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
  return NextResponse.json(toPublicJob(job));
}
