/**
 * builtin-tools/media.ts — Media import + image generation tools (shared).
 */

import { tool } from 'ai';
import { z } from 'zod';

export const MEDIA_SYSTEM_PROMPT = `<media-capability>
You have access to media tools:
- codepilot_import_media: Import local files to media library
- codepilot_generate_image: Generate images via Gemini
</media-capability>`;

export function createMediaTools(options?: { sessionId?: string; workingDirectory?: string }) {
  return {
    codepilot_import_media: tool({
      description: 'Import a local file (image, video, audio) into the CodePilot media library.',
      inputSchema: z.object({
        filePath: z.string().describe('Path to the local file'),
        title: z.string().optional(),
        prompt: z.string().optional().describe('Generation prompt (if AI-generated)'),
        source: z.string().optional(),
        model: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
      execute: async ({ filePath, title, prompt, source, model, tags }) => {
        try {
          const { importFileToLibrary } = await import('@/lib/media-saver');
          const result = await importFileToLibrary(filePath, {
            title,
            prompt,
            source,
            model,
            tags,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
          return `Media imported: ${typeof result === 'string' ? result : filePath}`;
        } catch (err) { return `Failed: ${err instanceof Error ? err.message : 'unknown'}`; }
      },
    }),

    codepilot_generate_image: tool({
      description: 'Generate an image using Gemini. The image appears inline in chat.',
      inputSchema: z.object({
        prompt: z.string().describe('Image generation prompt'),
        aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional(),
        imageSize: z.enum(['1K', '2K']).optional(),
        referenceImagePaths: z.array(z.string()).optional(),
      }),
      execute: async ({ prompt, aspectRatio, imageSize, referenceImagePaths }) => {
        try {
          const { generateSingleImage } = await import('@/lib/image-generator');
          const result = await generateSingleImage({
            prompt,
            aspectRatio,
            imageSize,
            referenceImagePaths,
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return `Image generated: ${'localPath' in result ? (result as any).localPath : 'success'}`;
        } catch (err) { return `Failed: ${err instanceof Error ? err.message : 'unknown'}`; }
      },
    }),
  };
}
