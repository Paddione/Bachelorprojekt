import { z } from 'zod';
import manifest from '../data/help-videos.json';

export const HelpVideoSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  duration: z.number().nonnegative(),
  poster: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type HelpVideo = z.infer<typeof HelpVideoSchema>;

const HelpVideoListSchema = z.array(HelpVideoSchema);

export function loadHelpVideos(): HelpVideo[] {
  return HelpVideoListSchema.parse(manifest);
}

const DEV_VIDEOVAULT_HOST = 'videovault.localhost';

export function resolveHelpVideos(videovaultHost: string): HelpVideo[] {
  return loadHelpVideos().map((v) => {
    try {
      const u = new URL(v.url);
      if (u.hostname === DEV_VIDEOVAULT_HOST) {
        u.hostname = videovaultHost;
        return { ...v, url: u.toString() };
      }
      return v;
    } catch {
      return v;
    }
  });
}
