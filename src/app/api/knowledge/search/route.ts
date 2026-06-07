import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { getProvider } from '@/lib/db';
import { searchKnowledge } from '@/lib/knowledge-retrieval';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query');
    const workspacePath = searchParams.get('workspace') || getSetting('assistant_workspace_path');
    const limit = parseInt(searchParams.get('limit') || '5', 10);
    const threshold = parseFloat(searchParams.get('threshold') || '0');

    if (!query) {
      return NextResponse.json({ error: 'Missing query parameter "q"' }, { status: 400 });
    }
    if (!workspacePath) {
      return NextResponse.json({ error: 'No workspace path configured' }, { status: 400 });
    }

    const providerId = getSetting('knowledge_embedding_provider') || getSetting('default_provider_id');
    const model = getSetting('knowledge_embedding_model') || 'text-embedding-3-small';

    if (!providerId) {
      return NextResponse.json(
        { error: 'No embedding provider configured.' },
        { status: 400 }
      );
    }

    const provider = getProvider(providerId);
    if (!provider) {
      return NextResponse.json(
        { error: `Provider "${providerId}" not found.` },
        { status: 400 }
      );
    }

    const results = await searchKnowledge(query, workspacePath, provider, model, { limit, threshold });

    return NextResponse.json({ results });
  } catch (e) {
    console.error('[knowledge/search] GET failed:', e);
    return NextResponse.json({ error: 'Search failed: ' + String(e) }, { status: 500 });
  }
}
