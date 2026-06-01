"""memory_skill — Knowledge memory backed by SQLite.

Searches use indexed queries instead of full JSONL scans.
Old JSONL files are migrated automatically on first access.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Optional

from runcore.tools.registry import register_tool
from runcore.memory.memory_db import (
    save_entry, list_entries, search_entries,
    review_entry, get_recent_context, get_entry_count,
)

log = logging.getLogger(__name__)


# ---- memory_save ----

@register_tool(
    name='memory_save',
    description='Save a fact or observation to memory (temporary layer by default)',
    parameters={
        'type': 'object',
        'properties': {
            'content': {'type': 'string', 'description': 'The fact or observation to save'},
            'category': {'type': 'string', 'description': 'Layer: "permanent" or "temporary"', 'default': 'temporary'},
            'project': {'type': 'string', 'description': 'Project name', 'default': 'conduit'},
            'tags': {'type': 'string', 'description': 'Comma-separated tags for search', 'default': ''},
        },
        'required': ['content']
    }
)
def memory_save(
    content: str,
    category: str = 'temporary',
    project: str = 'conduit',
    tags: str = '',
    username: str = '',
) -> dict:
    username = username or 'default'
    tag_list = [t.strip() for t in tags.split(',') if t.strip()]
    layer = 'permanent' if category == 'permanent' else 'temporary'

    entry_id = save_entry(
        username=username,
        project=project,
        content=content,
        layer=layer,
        tags=tag_list,
    )

    return {
        'success': True,
        'id': entry_id,
        'layer': layer,
        'project': project,
        'saved': len(content),
    }


# ---- memory_recall ----

@register_tool(
    name='memory_recall',
    description='Search and recall relevant facts from memory',
    parameters={
        'type': 'object',
        'properties': {
            'query': {'type': 'string', 'description': 'Search query (keywords)'},
            'project': {'type': 'string', 'description': 'Project name', 'default': 'conduit'},
            'layers': {'type': 'string', 'description': 'Layers to search: "permanent,temporary" or "permanent"', 'default': 'permanent,temporary'},
            'limit': {'type': 'integer', 'description': 'Max results to return', 'default': 10},
        },
        'required': ['query']
    }
)
def memory_recall(
    query: str,
    project: str = 'conduit',
    layers: str = 'permanent,temporary',
    limit: int = 10,
    username: str = '',
) -> dict:
    username = username or 'default'
    layer_list = [l.strip() for l in layers.split(',') if l.strip()]

    results = search_entries(
        username=username,
        project=project,
        query=query,
        layers=layer_list,
        limit=limit,
    )

    return {
        'success': True,
        'query': query,
        'project': project,
        'total_found': len(results),
        'results': results,
    }


# ---- memory_list ----

@register_tool(
    name='memory_list',
    description='List recent memory entries',
    parameters={
        'type': 'object',
        'properties': {
            'project': {'type': 'string', 'description': 'Project name', 'default': 'conduit'},
            'layer': {'type': 'string', 'description': 'Layer: "permanent" or "temporary"', 'default': 'permanent'},
            'limit': {'type': 'integer', 'description': 'Max entries to return', 'default': 20},
        },
    }
)
def memory_list(
    project: str = 'conduit',
    layer: str = 'permanent',
    limit: int = 20,
    username: str = '',
) -> dict:
    username = username or 'default'

    entries = list_entries(
        username=username,
        project=project,
        layer=layer,
        limit=limit,
    )

    return {
        'success': True,
        'project': project,
        'layer': layer,
        'total': get_entry_count(username, project),
        'shown': len(entries),
        'entries': entries,
    }


# ---- memory_review ----

@register_tool(
    name='memory_review',
    description='Promote temporary entries to permanent memory',
    parameters={
        'type': 'object',
        'properties': {
            'entry_id': {'type': 'string', 'description': 'ID of the entry to promote'},
            'project': {'type': 'string', 'description': 'Project name', 'default': 'conduit'},
            'action': {'type': 'string', 'description': '"promote" (temporary->permanent) or "discard"', 'default': 'promote'},
        },
        'required': ['entry_id']
    }
)
def memory_review(
    entry_id: str,
    project: str = 'conduit',
    action: str = 'promote',
    username: str = '',
) -> dict:
    username = username or 'default'
    return review_entry(
        username=username,
        project=project,
        entry_id=entry_id,
        action=action,
    )


# ---- get_memory_context ----

@register_tool(
    name='get_memory_context',
    description='Get all relevant context from memory to inject into the agent prompt',
    parameters={
        'type': 'object',
        'properties': {
            'project': {'type': 'string', 'description': 'Project name', 'default': 'conduit'},
            'query': {'type': 'string', 'description': 'Optional query to focus recall', 'default': ''},
        },
    }
)
def get_memory_context(
    project: str = 'conduit',
    query: str = '',
    username: str = '',
) -> dict:
    username = username or 'default'

    # Focused recall if query provided
    if query:
        results = search_entries(
            username=username,
            project=project,
            query=query,
            layers=['permanent', 'temporary'],
            limit=5,
        )
        context_parts = [f'## Memory Recall for: {query}']
        for r in results:
            context_parts.append(f'[{r["layer"]}] {r["content"]}')
        summary = get_recent_context(username, project, limit=5)
        return {
            'success': True,
            'context': '\n'.join(context_parts),
            'summary': summary,
        }

    # Recent context
    summary = get_recent_context(username, project, limit=10)
    recent = summary.get('recent', [])
    if not recent:
        return {'success': True, 'context': '', 'summary': {}}

    context_parts = ['## Recent Memory']
    for entry in recent:
        context_parts.append(f'[{entry.get("layer", "")}] {entry.get("preview", "")}')

    return {
        'success': True,
        'context': '\n'.join(context_parts),
        'summary': summary,
    }
