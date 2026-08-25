import { z } from 'zod';
import type { Channel } from '../../domain/models';
import { subscriberPrecisionFor } from '../../domain/metrics/format';
import { authorizedFetchJson } from '../google/http';
import { TubeMilestonesError } from '../errors';

const thumbnailSchema = z.object({
  url: z.url(),
  width: z.number().optional(),
  height: z.number().optional(),
});

const channelListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      snippet: z.object({
        title: z.string(),
        publishedAt: z.string(),
        thumbnails: z
          .object({
            default: thumbnailSchema.optional(),
            medium: thumbnailSchema.optional(),
            high: thumbnailSchema.optional(),
          })
          .optional(),
      }),
      statistics: z.object({
        viewCount: z.string().regex(/^\d+$/),
        subscriberCount: z.string().regex(/^\d+$/).optional(),
        hiddenSubscriberCount: z.boolean().default(false),
        videoCount: z.string().regex(/^\d+$/),
      }),
      contentDetails: z.object({
        relatedPlaylists: z.object({
          uploads: z.string().min(1),
        }),
      }),
    }),
  ),
});

function unsignedNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new TubeMilestonesError(
      'MALFORMED_RESPONSE',
      `YouTube returned an invalid ${name}.`,
    );
  }
  return parsed;
}

function thumbnailUrl(
  thumbnails:
    | {
        default?: { url: string };
        medium?: { url: string };
        high?: { url: string };
      }
    | undefined,
): string {
  return (
    thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? ''
  );
}

export async function fetchOwnedChannels(
  accessToken: string,
  observedAt: string,
  signal?: AbortSignal,
): Promise<Channel[]> {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet,statistics,contentDetails');
  url.searchParams.set('mine', 'true');

  const raw = await authorizedFetchJson(url, accessToken, { signal });
  const parsed = channelListSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TubeMilestonesError(
      'MALFORMED_RESPONSE',
      'YouTube returned an unexpected channel response.',
      { cause: parsed.error },
    );
  }

  return parsed.data.items.map((item) => {
    const hidden = item.statistics.hiddenSubscriberCount;
    const subscriberCount =
      hidden || item.statistics.subscriberCount === undefined
        ? null
        : unsignedNumber(item.statistics.subscriberCount, 'subscriber count');

    return {
      channelId: item.id,
      title: item.snippet.title,
      thumbnailUrl: thumbnailUrl(item.snippet.thumbnails),
      publishedAt: item.snippet.publishedAt,
      subscriberCount,
      subscriberCountPrecision: subscriberPrecisionFor(hidden, subscriberCount),
      hiddenSubscriberCount: hidden,
      viewCount: unsignedNumber(item.statistics.viewCount, 'view count'),
      videoCount: unsignedNumber(item.statistics.videoCount, 'video count'),
      uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
      updatedAt: observedAt,
    } satisfies Channel;
  });
}
