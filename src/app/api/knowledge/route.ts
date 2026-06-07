import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { reindexWorkspace } from '@/lib/knowledge-embedder';
import { getKnowledgeStatsForWorkspace } from '@/lib/knowledge-retrieval';
import { getProvider } from '@/lib/db';

export async function GET() {
  try {
    const workspacePath = getSetting('assistant_workspace_path');
    if (!workspacePath) {
      return NextResponse.json({ error: 'No workspace path configured' }, { status: 400 });
    }

    const stats = getKnowledgeStatsForWorkspace(workspacePath);
    return NextResponse.json(stats);
  } catch (e) {
    console.error('[knowledge] GET failed:', e);
    return NextResponse.json({ error: 'Failed to get knowledge stats' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const workspacePath = getSetting('assistant_workspace_path');
    if (!workspacePath) {
      return NextResponse.json({ error: 'No workspace path configured' }, { status: 400 });
    }

    const providerId = getSetting('knowledge_embedding_provider') || getSetting('default_provider_id');
    const model = getSetting('knowledge_embedding_model') || 'text-embedding-3-small';

    if (!providerId) {
      return NextResponse.json(
        { error: 'No embedding provider configured. Set a default provider in Settings.' },
        { status: 400 }
      );
    }

    const provider = getProvider(providerId);
    if (!provider) {
      return NextResponse.json(
        { error: `Provider "${providerId}" not found. Check your Settings.` },
        { status: 400 }
      );
    }

    if (!provider.api_key && !provider.base_url) {
      return NextResponse.json(
        { error: `Provider "${provider.name}" has no API key or base URL configured.` },
        { status: 400 }
      );
    }

    const { indexWorkspace } = await import('@/lib/workspace-indexer');
    // First ensure the text index is up to date
    await indexWorkspace(workspacePath, { force: true });

    // Then generate embeddings
    const result = await reindexWorkspace(workspacePath, provider, model, { force: true });

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error('[knowledge] POST failed:', e);
    return NextResponse.json({ error: 'Indexing failed: ' + String(e) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const workspacePath = getSetting('assistant_workspace_path');
    if (!workspacePath) {
      return NextResponse.json({ error: 'No workspace path configured' }, { status: 400 });
    }

    const { deleteKnowledgeEntriesByWorkspace } = await import('@/lib/db');
    deleteKnowledgeEntriesByWorkspace(workspacePath);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[knowledge] DELETE failed:', e);
    return NextResponse.json({ error: 'Failed to clear knowledge base' }, { status: 500 });
  }
}
