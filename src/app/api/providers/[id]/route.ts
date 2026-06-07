import { NextRequest, NextResponse } from 'next/server';
import { getProvider, updateProvider, deleteProvider, getDefaultProviderId, setDefaultProviderId, getAllProviders, getSetting, setSetting } from '@/lib/db';
import { getEffectiveProviderProtocol, isValidProtocol } from '@/lib/provider-catalog';
import type { ProviderResponse, ErrorResponse, UpdateProviderRequest, ApiProvider } from '@/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function maskApiKey(provider: ApiProvider): ApiProvider {
  let maskedKey = provider.api_key;
  if (maskedKey && maskedKey.length > 8) {
    maskedKey = '***' + maskedKey.slice(-8);
  }
  return { ...provider, api_key: maskedKey };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const provider = getProvider(id);
    if (!provider) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Provider not found' },
        { status: 404 }
      );
    }

    return NextResponse.json<ProviderResponse>({ provider: maskApiKey(provider) });
  } catch (error) {
    return NextResponse.json<ErrorResponse>(
      { error: error instanceof Error ? error.message : 'Failed to get provider' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body: UpdateProviderRequest = await request.json();

    const existing = getProvider(id);
    if (!existing) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Provider not found' },
        { status: 404 }
      );
    }

    // If api_key starts with ***, the client sent back a masked value — don't update it
    if (body.api_key && body.api_key.startsWith('***')) {
      delete body.api_key;
    }

    // Reject unknown raw protocol updates (mirrors POST validation).
    if (body.protocol !== undefined && body.protocol !== '' && !isValidProtocol(body.protocol)) {
      return NextResponse.json<ErrorResponse>(
        {
          error: `Unknown protocol '${body.protocol}'`,
          code: 'INVALID_PROTOCOL',
        },
        { status: 400 }
      );
    }

    // Anthropic-protocol providers must declare a base URL on update.
    // A PUT that clears base_url on an anthropic provider would regress
    // to the same ambiguous state as a blank third-party provider
    // (silently proxies to api.anthropic.com and gets first-party
    // catalog). The effective protocol after merge is what counts, and
    // existing.protocol can be '' on legacy rows — inferring from
    // provider_type + base_url covers that case.
    const mergedProtocol = body.protocol !== undefined ? body.protocol : existing.protocol;
    const mergedProviderType = body.provider_type !== undefined ? body.provider_type : existing.provider_type;
    const mergedBaseUrl = body.base_url !== undefined ? body.base_url : existing.base_url;
    const effectiveProtocol = getEffectiveProviderProtocol(
      mergedProviderType ?? '',
      mergedProtocol,
      mergedBaseUrl ?? '',
    );
    if (effectiveProtocol === 'anthropic' && !mergedBaseUrl?.trim()) {
      return NextResponse.json<ErrorResponse>(
        {
          error: 'Anthropic-protocol providers must specify a base URL (use https://api.anthropic.com for the official API, or your third-party endpoint)',
          code: 'ANTHROPIC_BASE_URL_REQUIRED',
        },
        { status: 400 }
      );
    }
    // Same guard for media providers — a PUT that clears base_url on an
    // openai-image/gemini-image row would silently redirect to the official
    // endpoint.
    if (
      (effectiveProtocol === 'openai-image' || effectiveProtocol === 'gemini-image')
      && !mergedBaseUrl?.trim()
    ) {
      return NextResponse.json<ErrorResponse>(
        {
          error: effectiveProtocol === 'openai-image'
            ? 'OpenAI Image providers must specify a base URL'
            : 'Gemini Image providers must specify a base URL',
          code: 'MEDIA_BASE_URL_REQUIRED',
        },
        { status: 400 }
      );
    }

    const updated = updateProvider(id, body);
    if (!updated) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Failed to update provider' },
        { status: 500 }
      );
    }

    // Defensive: if the active-image row's type just moved out of media
    // (e.g. someone edits gemini-image → anthropic), clear the setting.
    // The ProviderManager banner already surfaces this post-hoc, but
    // clearing here keeps /api/providers/active-image GET honest and
    // ensures pickImageProvider falls through cleanly on the next call.
    const updatedIsMedia = updated.provider_type === 'gemini-image' || updated.provider_type === 'openai-image';
    if (!updatedIsMedia && getSetting('active_image_provider_id') === id) {
      setSetting('active_image_provider_id', '');
    }

    return NextResponse.json<ProviderResponse>({ provider: maskApiKey(updated) });
  } catch (error) {
    return NextResponse.json<ErrorResponse>(
      { error: error instanceof Error ? error.message : 'Failed to update provider' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const deleted = deleteProvider(id);
    if (!deleted) {
      return NextResponse.json<ErrorResponse>(
        { error: 'Provider not found' },
        { status: 404 }
      );
    }

    // If the deleted provider was the default, clear the stale reference
    // and auto-switch to the first remaining provider (if any).
    const currentDefault = getDefaultProviderId();
    if (currentDefault === id) {
      const remaining = getAllProviders();
      if (remaining.length > 0) {
        setDefaultProviderId(remaining[0].id);
      } else {
        setDefaultProviderId('');
      }
    }

    // If the deleted provider was the active image-generation provider,
    // clear the setting so the UI's "active" badge doesn't linger on a
    // non-existent row and pickImageProvider falls back cleanly.
    const activeImageId = getSetting('active_image_provider_id');
    if (activeImageId === id) {
      setSetting('active_image_provider_id', '');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json<ErrorResponse>(
      { error: error instanceof Error ? error.message : 'Failed to delete provider' },
      { status: 500 }
    );
  }
}
