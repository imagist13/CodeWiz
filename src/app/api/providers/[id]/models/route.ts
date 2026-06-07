import { NextRequest, NextResponse } from 'next/server';
import { getProvider, getModelsForProvider, upsertProviderModel, deleteProviderModel } from '@/lib/db';
import type { ErrorResponse } from '@/types';

/**
 * GET /api/providers/[id]/models
 * List all custom models for a provider (from provider_models table).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const provider = getProvider(id);
  if (!provider) {
    return NextResponse.json<ErrorResponse>({ error: 'Provider not found' }, { status: 404 });
  }
  const models = getModelsForProvider(id);
  return NextResponse.json({ models });
}

/**
 * POST /api/providers/[id]/models
 * Add or update a custom model for a provider.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const provider = getProvider(id);
  if (!provider) {
    return NextResponse.json<ErrorResponse>({ error: 'Provider not found' }, { status: 404 });
  }

  const body = await request.json();
  const { model_id, upstream_model_id, display_name, capabilities_json, sort_order } = body;

  if (!model_id) {
    return NextResponse.json<ErrorResponse>({ error: 'model_id is required' }, { status: 400 });
  }

  upsertProviderModel({
    provider_id: id,
    model_id,
    upstream_model_id: upstream_model_id || '',
    display_name: display_name || model_id,
    capabilities_json: capabilities_json || '{}',
    sort_order: sort_order ?? 0,
  });

  const models = getModelsForProvider(id);
  return NextResponse.json({ models });
}

/**
 * DELETE /api/providers/[id]/models
 * Remove a custom model from a provider.
 * Body: { model_id: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const provider = getProvider(id);
  if (!provider) {
    return NextResponse.json<ErrorResponse>({ error: 'Provider not found' }, { status: 404 });
  }

  const body = await request.json();
  const { model_id } = body;

  if (!model_id) {
    return NextResponse.json<ErrorResponse>({ error: 'model_id is required' }, { status: 400 });
  }

  const deleted = deleteProviderModel(id, model_id);
  if (!deleted) {
    return NextResponse.json<ErrorResponse>({ error: 'Model not found' }, { status: 404 });
  }

  const models = getModelsForProvider(id);
  return NextResponse.json({ models });
}
