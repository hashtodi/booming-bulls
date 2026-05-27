import { NextRequest, NextResponse } from "next/server";
import { handleMockRun, isTestModeEnabled } from "../../data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  if (!isTestModeEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { kind } = await params;
  return handleMockRun(kind, req.url);
}
