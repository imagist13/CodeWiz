import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/plugins/mcp/reconnect — Reconnect a specific MCP server.
 */
export async function POST(request: NextRequest) {
  try {
    const { serverName } = await request.json();

    if (!serverName) {
      return NextResponse.json({ error: 'serverName is required' }, { status: 400 });
    }

    const { reconnectServer } = await import('@/lib/mcp-connection-manager');
    await reconnectServer(serverName);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[mcp/reconnect] Failed to reconnect MCP server:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
