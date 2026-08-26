import { z } from 'zod';
import type { MetricType, ThemePreference } from '../../domain/models';
import { TubeMilestonesError } from '../errors';
import { requireSupabaseClient } from './client';
import { invokeFunction } from './invoke';

const oauthStartSchema = z.object({ authorizationUrl: z.url() });
const syncResponseSchema = z.object({
  kind: z.enum(['READY', 'CHANNEL_SELECTION_REQUIRED']),
  selectedChannelId: z.uuid().nullable(),
  channels: z.array(
    z.object({ id: z.uuid(), title: z.string(), thumbnailUrl: z.string() }),
  ),
  warnings: z.array(z.string()),
  newMilestoneIds: z.array(z.uuid()),
  archive: z.object({
    archivedPeriods: z.array(z.string()),
    configuration: z.enum(['ready', 'missing']),
  }),
});

const deletionSchema = z.object({
  deletionId: z.uuid(),
  status: z.enum(['COMPLETE', 'PENDING']),
});

export type SyncResponse = z.infer<typeof syncResponseSchema>;
export type DeletionResponse = z.infer<typeof deletionSchema>;

export async function startYouTubeAuthorization(): Promise<void> {
  const raw = await invokeFunction<unknown>('youtube-oauth-start');
  const result = oauthStartSchema.safeParse(raw);
  if (!result.success) {
    throw new TubeMilestonesError(
      'SUPABASE_ERROR',
      'The authorization URL was invalid.',
      { cause: result.error },
    );
  }
  const url = new URL(result.data.authorizationUrl);
  if (url.origin !== 'https://accounts.google.com') {
    throw new TubeMilestonesError(
      'SUPABASE_ERROR',
      'The authorization URL was unsafe.',
    );
  }
  window.location.assign(url.toString());
}

export async function synchronizeChannel(
  input: {
    channelId?: string | null;
    manual?: boolean;
  } = {},
): Promise<SyncResponse> {
  const raw = await invokeFunction<unknown>('youtube-sync', {
    channelId: input.channelId ?? null,
    manual: input.manual ?? true,
  });
  const parsed = syncResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TubeMilestonesError(
      'SUPABASE_ERROR',
      'Sync returned an invalid response.',
      {
        cause: parsed.error,
      },
    );
  }
  return parsed.data;
}

export async function updateTheme(
  userId: string,
  theme: ThemePreference,
): Promise<void> {
  const { error } = await requireSupabaseClient()
    .from('profiles')
    .update({ theme })
    .eq('user_id', userId);
  if (error)
    throw new TubeMilestonesError('SUPABASE_ERROR', 'Theme could not be saved.', {
      cause: error,
    });
}

export async function selectChannel(userId: string, channelId: string): Promise<void> {
  const { error } = await requireSupabaseClient()
    .from('profiles')
    .update({ selected_channel_id: channelId })
    .eq('user_id', userId);
  if (error)
    throw new TubeMilestonesError('SUPABASE_ERROR', 'Channel could not be selected.', {
      cause: error,
    });
}

export async function createGoal(input: {
  userId: string;
  channelId: string;
  metric: MetricType;
  target: number;
  title: string | null;
  targetDate: string | null;
}): Promise<void> {
  const { error } = await requireSupabaseClient().from('custom_goals').insert({
    user_id: input.userId,
    channel_id: input.channelId,
    metric: input.metric,
    target: input.target.toString(),
    title: input.title,
    target_date: input.targetDate,
  });
  if (error)
    throw new TubeMilestonesError('SUPABASE_ERROR', 'Goal could not be saved.', {
      cause: error,
    });
}

export async function deleteGoal(goalId: string): Promise<void> {
  const { error } = await requireSupabaseClient()
    .from('custom_goals')
    .delete()
    .eq('id', goalId);
  if (error)
    throw new TubeMilestonesError('SUPABASE_ERROR', 'Goal could not be deleted.', {
      cause: error,
    });
}

export async function saveManualValues(input: {
  userId: string;
  channelId: string;
  qualifiedPublicWatchHours: number | null;
  qualifiedShortsViews: number | null;
}): Promise<void> {
  const { error } = await requireSupabaseClient()
    .from('manual_metrics')
    .upsert({
      user_id: input.userId,
      channel_id: input.channelId,
      qualified_public_watch_hours: input.qualifiedPublicWatchHours,
      qualified_shorts_views: input.qualifiedShortsViews?.toString() ?? null,
      updated_at: new Date().toISOString(),
    });
  if (error)
    throw new TubeMilestonesError(
      'SUPABASE_ERROR',
      'Manual values could not be saved.',
      { cause: error },
    );
}

export async function markCelebrationSeen(milestoneId: string): Promise<void> {
  const { error } = await requireSupabaseClient().rpc(
    'mark_milestone_celebration_seen',
    { p_milestone_id: milestoneId },
  );
  if (error)
    throw new TubeMilestonesError('SUPABASE_ERROR', 'Milestone could not be updated.', {
      cause: error,
    });
}

export async function requestYouTubeDisconnect(): Promise<DeletionResponse> {
  return deletionSchema.parse(await invokeFunction<unknown>('disconnect-youtube'));
}

export async function requestAccountDeletion(): Promise<DeletionResponse> {
  return deletionSchema.parse(await invokeFunction<unknown>('delete-account'));
}
