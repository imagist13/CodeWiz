import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/interrupt — Interrupt an active session.
 *
 * Tries both runtimes since we don't know which one is running this session:
 * - Native: AbortController-based interrupt
 * - SDK: conversation.interrupt() on the CLI subprocess
 */
export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    // Try native runtime (AbortController)
    try {
      const { getRuntime } = await import('@/lib/runtime');
      const nativeRt = getRuntime('native');
      if (nativeRt) {
        nativeRt.interrupt(sessionId);
      }
    } catch { /* native not available */ }

    // Try SDK runtime (conversation.interrupt)
    try {
      const { getConversation } = await import('@/lib/conversation-registry');
      const conversation = getConversation(sessionId);
      if (conversation) {
        await conversation.interrupt();
      }
    } catch { /* SDK not available */ }

    return NextResponse.json({ interrupted: true });
  } catch (error) {
    console.error('[interrupt] Failed to interrupt:', error);
    return NextResponse.json({ interrupted: false, error: String(error) });
  }
}
