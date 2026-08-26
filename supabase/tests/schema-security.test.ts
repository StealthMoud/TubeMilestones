// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(
  resolve('supabase/migrations/20260826120000_cloud_data_model.sql'),
  'utf8',
);
const helpers = readFileSync(
  resolve('supabase/migrations/20260826120100_trusted_backend_functions.sql'),
  'utf8',
);
const automation = readFileSync(
  resolve('supabase/migrations/20260826120200_automation_secret.sql'),
  'utf8',
);
const workerClaims = readFileSync(
  resolve('supabase/migrations/20260826120300_atomic_worker_claims.sql'),
  'utf8',
);
const tables = [
  'profiles',
  'youtube_connections',
  'youtube_token_vault',
  'channels',
  'channel_snapshots',
  'analytics_daily',
  'analytics_summary',
  'milestone_states',
  'custom_goals',
  'manual_metrics',
  'archive_manifests',
  'youtube_oauth_attempts',
  'data_deletion_requests',
];
const browserReadableTables = [
  'profiles',
  'youtube_connections',
  'channels',
  'channel_snapshots',
  'analytics_daily',
  'analytics_summary',
  'milestone_states',
  'custom_goals',
  'manual_metrics',
  'archive_manifests',
];

describe('database security migration', () => {
  it.each(tables)('enables RLS and revokes browser defaults on %s', (table) => {
    expect(schema).toContain(`alter table public.${table} enable row level security;`);
    expect(schema).toContain(
      `revoke all on table public.${table} from anon, authenticated;`,
    );
  });

  it('keeps state, token mapping, and deletion internals without browser policies', () => {
    for (const table of [
      'youtube_token_vault',
      'youtube_oauth_attempts',
      'data_deletion_requests',
    ]) {
      expect(schema).not.toMatch(
        new RegExp(`create policy [^;]+ on public\\.${table}`, 'u'),
      );
    }
  });

  it.each(browserReadableTables)('scopes %s reads to auth.uid ownership', (table) => {
    expect(schema).toMatch(
      new RegExp(
        `create policy [^;]+ on public\\.${table}[\\s\\S]+?for select to authenticated[\\s\\S]+?auth\\.uid\\(\\)\\) = user_id`,
        'u',
      ),
    );
  });

  it('keeps trusted analytics and connection fields read-only to browsers', () => {
    expect(schema).not.toContain(
      'grant insert, update, delete on table public.youtube_connections to authenticated',
    );
    expect(schema).not.toContain(
      'grant insert, update, delete on table public.analytics_daily to authenticated',
    );
    expect(schema).toContain(
      'grant select on table public.archive_manifests to authenticated;',
    );
  });

  it('allows celebration acknowledgement only through the one-way own-user RPC', () => {
    expect(schema).not.toContain(
      'grant update (celebration_seen) on table public.milestone_states',
    );
    const acknowledgement = helpers.slice(
      helpers.indexOf(
        'create or replace function public.mark_milestone_celebration_seen',
      ),
      helpers.indexOf('revoke execute on function public.store_youtube_refresh_token'),
    );
    expect(acknowledgement).toContain('security definer');
    expect(acknowledgement).toContain('set celebration_seen = true');
    expect(acknowledgement).toContain(
      'where id = p_milestone_id and user_id = (select auth.uid())',
    );
  });

  it('revokes Vault helper execution from public browser roles', () => {
    expect(helpers).toContain(
      'revoke execute on function public.read_youtube_refresh_token(uuid)',
    );
    expect(helpers).toContain('from public, anon, authenticated;');
    expect(helpers).toContain(
      'grant execute on function public.read_youtube_refresh_token(uuid) to service_role;',
    );
  });

  it('does not define a plaintext refresh-token column', () => {
    const connectionDefinition = schema.slice(
      schema.indexOf('create table public.youtube_connections'),
      schema.indexOf('create table public.youtube_token_vault'),
    );
    expect(connectionDefinition).not.toMatch(/refresh_token/iu);
  });

  it('atomically associates OAuth state and sync claims with the stored user', () => {
    expect(helpers).toContain('update public.youtube_oauth_attempts attempt');
    expect(helpers).toContain('returning attempt.user_id, attempt.code_verifier');
    expect(helpers).toContain('from public.youtube_connections');
    expect(helpers).toContain('where user_id = p_user_id\n  for update;');
  });

  it('keeps compliance and deletion queue claims atomic and server-only', () => {
    for (const functionName of [
      'claim_due_compliance_connections',
      'claim_deletion_requests',
    ]) {
      expect(workerClaims).toContain(
        `create or replace function public.${functionName}`,
      );
      expect(workerClaims).toMatch(
        new RegExp(
          `revoke execute on function public\\.${functionName}\\(integer, uuid\\)[\\s\\S]+?from public, anon, authenticated`,
          'u',
        ),
      );
      expect(workerClaims).toContain(
        `grant execute on function public.${functionName}(integer, uuid)`,
      );
    }
    expect(workerClaims.match(/for update skip locked/gu)).toHaveLength(2);
    expect(workerClaims).toContain('last_authorization_verified_at asc nulls first');
    expect(workerClaims).toContain(
      "verification_claimed_at <= now() - interval '10 minutes'",
    );
    expect(workerClaims).toContain("started_at <= now() - interval '15 minutes'");
  });

  it('separates public Supabase routing from the private automation header', () => {
    const cron = automation.slice(
      automation.indexOf(
        'create or replace function public.install_tubemilestones_cron_jobs',
      ),
    );
    expect(cron).toContain("'X-TubeMilestones-Automation'");
    expect(cron).toContain("where name = 'tubemilestones_publishable_key'");
    expect(cron).toContain("where name = 'tubemilestones_automation_secret'");
    expect(cron).not.toMatch(/SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY/u);
  });
});
