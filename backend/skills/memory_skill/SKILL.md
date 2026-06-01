---
name: Memory Management
description: Save, search, and recall facts from conversation history. Use to persist learned information.
---
# Memory Management

Store and retrieve knowledge from the agent's memory system.

## Memory Layers
- **permanent**: Confirmed facts, preferences, and patterns. Never forgotten.
- **temporary**: Observations from recent changes, pending review.

## When to Use
- After completing a task: save key findings with `memory_save`
- When starting a new task: recall relevant context with `memory_recall`
- Before a big change: search memory for similar past experiences

## Storage
Memory is stored per-user at `users/<username>/memory/`
