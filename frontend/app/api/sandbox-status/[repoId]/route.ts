import { NextResponse } from "next/server";

const AI_SERVICE_URL =
  process.env.NEXT_PUBLIC_AI_SERVICE_URL || "http://localhost:8000";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await ctx.params;

  try {
    const response = await fetch(
      `${AI_SERVICE_URL}/api/sandbox/status/${repoId}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Sandbox not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json(
      { error: "AI service unreachable" },
      { status: 502 },
    );
  }
}
