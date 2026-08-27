// Schema type snapshot for the checked-in migrations.
// Regenerate against a linked or local project with:
// npx supabase gen types typescript --local > supabase/database.types.ts

export type Json =
  string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationship[];
};

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        {
          user_id: string;
          theme: 'system' | 'dark' | 'light';
          selected_channel_id: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          user_id: string;
          theme?: 'system' | 'dark' | 'light';
          selected_channel_id?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          theme?: 'system' | 'dark' | 'light';
          selected_channel_id?: string | null;
        }
      >;
      youtube_connections: Table<
        Timestamps & {
          id: string;
          user_id: string;
          google_subject: string;
          google_email: string | null;
          status:
            | 'CONNECTED'
            | 'SYNCING'
            | 'REAUTH_REQUIRED'
            | 'COMPLIANCE_HOLD'
            | 'DELETION_PENDING';
          connected_at: string;
          last_authorization_verified_at: string | null;
          last_verification_attempt_at: string | null;
          verification_retry_count: number;
          verification_claim_id: string | null;
          verification_claimed_at: string | null;
          last_synced_at: string | null;
          last_sync_started_at: string | null;
          last_sync_error_code: string | null;
          granted_scopes: string[];
        },
        {
          id?: string;
          user_id: string;
          google_subject: string;
          google_email?: string | null;
          status?:
            | 'CONNECTED'
            | 'SYNCING'
            | 'REAUTH_REQUIRED'
            | 'COMPLIANCE_HOLD'
            | 'DELETION_PENDING';
          connected_at?: string;
          last_authorization_verified_at?: string | null;
          last_verification_attempt_at?: string | null;
          verification_retry_count?: number;
          verification_claim_id?: string | null;
          verification_claimed_at?: string | null;
          last_synced_at?: string | null;
          last_sync_started_at?: string | null;
          last_sync_error_code?: string | null;
          granted_scopes?: string[];
          created_at?: string;
          updated_at?: string;
        },
        {
          google_subject?: string;
          google_email?: string | null;
          status?:
            | 'CONNECTED'
            | 'SYNCING'
            | 'REAUTH_REQUIRED'
            | 'COMPLIANCE_HOLD'
            | 'DELETION_PENDING';
          connected_at?: string;
          last_authorization_verified_at?: string | null;
          last_verification_attempt_at?: string | null;
          verification_retry_count?: number;
          verification_claim_id?: string | null;
          verification_claimed_at?: string | null;
          last_synced_at?: string | null;
          last_sync_started_at?: string | null;
          last_sync_error_code?: string | null;
          granted_scopes?: string[];
        }
      >;
      youtube_token_vault: Table<
        Timestamps & { connection_id: string; user_id: string; secret_id: string },
        {
          connection_id: string;
          user_id: string;
          secret_id: string;
          created_at?: string;
          updated_at?: string;
        },
        { user_id?: string; secret_id?: string; updated_at?: string }
      >;
      channels: Table<
        Timestamps & {
          id: string;
          user_id: string;
          connection_id: string;
          youtube_channel_id: string;
          title: string;
          thumbnail_url: string;
          published_at: string;
          subscriber_count: string | null;
          subscriber_count_precision:
            'EXACT' | 'ROUNDED_THREE_SIGNIFICANT_FIGURES' | 'HIDDEN';
          hidden_subscriber_count: boolean;
          view_count: string;
          video_count: string;
          uploads_playlist_id: string;
          last_observed_at: string;
        },
        {
          id?: string;
          user_id: string;
          connection_id: string;
          youtube_channel_id: string;
          title: string;
          thumbnail_url?: string;
          published_at: string;
          subscriber_count?: string | null;
          subscriber_count_precision:
            'EXACT' | 'ROUNDED_THREE_SIGNIFICANT_FIGURES' | 'HIDDEN';
          hidden_subscriber_count?: boolean;
          view_count: string;
          video_count: string;
          uploads_playlist_id?: string;
          last_observed_at: string;
          created_at?: string;
          updated_at?: string;
        },
        {
          title?: string;
          thumbnail_url?: string;
          published_at?: string;
          subscriber_count?: string | null;
          subscriber_count_precision?:
            'EXACT' | 'ROUNDED_THREE_SIGNIFICANT_FIGURES' | 'HIDDEN';
          hidden_subscriber_count?: boolean;
          view_count?: string;
          video_count?: string;
          uploads_playlist_id?: string;
          last_observed_at?: string;
        }
      >;
      channel_snapshots: Table<
        Timestamps & {
          user_id: string;
          channel_id: string;
          snapshot_date: string;
          observed_at: string;
          subscriber_count: string | null;
          view_count: string;
          video_count: string;
        },
        {
          user_id: string;
          channel_id: string;
          snapshot_date: string;
          observed_at: string;
          subscriber_count?: string | null;
          view_count: string;
          video_count: string;
          created_at?: string;
          updated_at?: string;
        },
        {
          observed_at?: string;
          subscriber_count?: string | null;
          view_count?: string;
          video_count?: string;
        }
      >;
      analytics_daily: Table<
        Timestamps & {
          user_id: string;
          channel_id: string;
          day: string;
          views: string;
          estimated_minutes_watched: number | string;
          subscribers_gained: string;
          subscribers_lost: string;
          average_view_duration: number | string;
          average_view_percentage: number | string;
          fetched_at: string;
        },
        {
          user_id: string;
          channel_id: string;
          day: string;
          views: string;
          estimated_minutes_watched: number | string;
          subscribers_gained: string;
          subscribers_lost: string;
          average_view_duration: number | string;
          average_view_percentage: number | string;
          fetched_at: string;
          created_at?: string;
          updated_at?: string;
        },
        {
          views?: string;
          estimated_minutes_watched?: number | string;
          subscribers_gained?: string;
          subscribers_lost?: string;
          average_view_duration?: number | string;
          average_view_percentage?: number | string;
          fetched_at?: string;
        }
      >;
      analytics_summary: Table<
        Timestamps & {
          user_id: string;
          channel_id: string;
          requested_start_date: string;
          requested_end_date: string;
          available_through: string | null;
          estimated_minutes_watched: number | string;
          fetched_at: string;
        },
        {
          user_id: string;
          channel_id: string;
          requested_start_date: string;
          requested_end_date: string;
          available_through?: string | null;
          estimated_minutes_watched: number | string;
          fetched_at: string;
          created_at?: string;
          updated_at?: string;
        },
        {
          requested_start_date?: string;
          requested_end_date?: string;
          available_through?: string | null;
          estimated_minutes_watched?: number | string;
          fetched_at?: string;
        }
      >;
      milestone_states: Table<
        Timestamps & {
          id: string;
          user_id: string;
          channel_id: string;
          metric: 'subscribers' | 'views' | 'uploads' | 'watchHours';
          target: string;
          status: 'ACHIEVED' | 'NEXT' | 'FUTURE';
          detection_type:
            'PREEXISTING' | 'TRACKED_CROSSING' | 'USER_CREATED_ALREADY_COMPLETE';
          detected_at: string | null;
          celebration_seen: boolean;
          custom_goal_id: string | null;
        },
        {
          id?: string;
          user_id: string;
          channel_id: string;
          metric: 'subscribers' | 'views' | 'uploads' | 'watchHours';
          target: string;
          status: 'ACHIEVED' | 'NEXT' | 'FUTURE';
          detection_type:
            'PREEXISTING' | 'TRACKED_CROSSING' | 'USER_CREATED_ALREADY_COMPLETE';
          detected_at?: string | null;
          celebration_seen?: boolean;
          custom_goal_id?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          status?: 'ACHIEVED' | 'NEXT' | 'FUTURE';
          detection_type?:
            'PREEXISTING' | 'TRACKED_CROSSING' | 'USER_CREATED_ALREADY_COMPLETE';
          detected_at?: string | null;
          celebration_seen?: boolean;
        }
      >;
      custom_goals: Table<
        Timestamps & {
          id: string;
          user_id: string;
          channel_id: string;
          metric: 'subscribers' | 'views' | 'uploads' | 'watchHours';
          target: string;
          title: string | null;
          target_date: string | null;
        },
        {
          id?: string;
          user_id: string;
          channel_id: string;
          metric: 'subscribers' | 'views' | 'uploads' | 'watchHours';
          target: string;
          title?: string | null;
          target_date?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          metric?: 'subscribers' | 'views' | 'uploads' | 'watchHours';
          target?: string;
          title?: string | null;
          target_date?: string | null;
        }
      >;
      manual_metrics: Table<
        {
          user_id: string;
          channel_id: string;
          qualified_public_watch_hours: number | string | null;
          qualified_shorts_views: string | null;
          updated_at: string;
        },
        {
          user_id: string;
          channel_id: string;
          qualified_public_watch_hours?: number | string | null;
          qualified_shorts_views?: string | null;
          updated_at?: string;
        },
        {
          qualified_public_watch_hours?: number | string | null;
          qualified_shorts_views?: string | null;
          updated_at?: string;
        }
      >;
      archive_manifests: Table<
        Timestamps & {
          id: string;
          user_id: string;
          channel_id: string;
          period_start: string;
          period_end: string;
          object_key: string;
          format_version: number;
          key_version: number;
          analytics_row_count: number;
          snapshot_row_count: number;
          compressed_size_bytes: string | null;
          encrypted_size_bytes: string | null;
          sha256: string | null;
          status:
            'WRITING' | 'UPLOADED' | 'VERIFIED' | 'READY' | 'DELETE_PENDING' | 'ERROR';
          last_error_code: string | null;
          archived_at: string | null;
          verified_at: string | null;
        },
        {
          id?: string;
          user_id: string;
          channel_id: string;
          period_start: string;
          period_end: string;
          object_key: string;
          format_version: number;
          key_version: number;
          analytics_row_count: number;
          snapshot_row_count: number;
          compressed_size_bytes?: string | null;
          encrypted_size_bytes?: string | null;
          sha256?: string | null;
          status:
            'WRITING' | 'UPLOADED' | 'VERIFIED' | 'READY' | 'DELETE_PENDING' | 'ERROR';
          last_error_code?: string | null;
          archived_at?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          status?:
            'WRITING' | 'UPLOADED' | 'VERIFIED' | 'READY' | 'DELETE_PENDING' | 'ERROR';
          compressed_size_bytes?: string | null;
          encrypted_size_bytes?: string | null;
          sha256?: string | null;
          last_error_code?: string | null;
          archived_at?: string | null;
          verified_at?: string | null;
        }
      >;
      youtube_oauth_attempts: Table<
        {
          id: string;
          user_id: string;
          state_hash: string;
          code_verifier: string;
          intent: 'ADD' | 'RECONNECT';
          target_connection_id: string | null;
          created_at: string;
          expires_at: string;
          used_at: string | null;
        },
        {
          id?: string;
          user_id: string;
          state_hash: string;
          code_verifier: string;
          intent?: 'ADD' | 'RECONNECT';
          target_connection_id?: string | null;
          created_at?: string;
          expires_at: string;
          used_at?: string | null;
        },
        {
          intent?: 'ADD' | 'RECONNECT';
          target_connection_id?: string | null;
          used_at?: string | null;
        }
      >;
      data_deletion_requests: Table<
        {
          id: string;
          user_id: string;
          connection_id: string | null;
          type: 'YOUTUBE_DISCONNECT' | 'ACCOUNT_DELETE' | 'COMPLIANCE_REVOKED';
          status:
            'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED_RETRYABLE' | 'FAILED_FINAL';
          requested_at: string;
          started_at: string | null;
          completed_at: string | null;
          last_error: string | null;
          attempts: number;
          claim_id: string | null;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          connection_id?: string | null;
          type: 'YOUTUBE_DISCONNECT' | 'ACCOUNT_DELETE' | 'COMPLIANCE_REVOKED';
          status?:
            'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED_RETRYABLE' | 'FAILED_FINAL';
          requested_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          last_error?: string | null;
          attempts?: number;
          claim_id?: string | null;
          updated_at?: string;
        },
        {
          status?:
            'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED_RETRYABLE' | 'FAILED_FINAL';
          started_at?: string | null;
          completed_at?: string | null;
          last_error?: string | null;
          attempts?: number;
          claim_id?: string | null;
          connection_id?: string | null;
        }
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      claim_deletion_requests: {
        Args: { p_batch_size: number; p_claim_id: string };
        Returns: {
          id: string;
          user_id: string;
          connection_id: string | null;
          type: 'YOUTUBE_DISCONNECT' | 'ACCOUNT_DELETE' | 'COMPLIANCE_REVOKED';
          requested_at: string;
          attempts: number;
          claim_id: string;
        }[];
      };
      claim_due_compliance_connections: {
        Args: { p_batch_size: number; p_claim_id: string };
        Returns: {
          connection_id: string;
          user_id: string;
          status: 'CONNECTED' | 'SYNCING';
          last_authorization_verified_at: string | null;
          verification_retry_count: number;
          granted_scopes: string[];
          verification_claim_id: string;
        }[];
      };
      claim_youtube_sync: {
        Args: {
          p_connection_id: string;
          p_user_id: string;
          p_manual?: boolean;
        };
        Returns: string;
      };
      complete_youtube_oauth_connection: {
        Args: {
          p_user_id: string;
          p_intent: 'ADD' | 'RECONNECT';
          p_target_connection_id: string | null;
          p_google_subject: string;
          p_google_email: string | null;
          p_refresh_token: string;
          p_granted_scopes: string[];
          p_channels: Json;
        };
        Returns: Json;
      };
      consume_youtube_oauth_attempt: {
        Args: { p_state_hash: string };
        Returns: {
          user_id: string;
          code_verifier: string;
          intent: 'ADD' | 'RECONNECT';
          target_connection_id: string | null;
        }[];
      };
      delete_youtube_refresh_token: {
        Args: { p_connection_id: string; p_user_id: string };
        Returns: boolean;
      };
      finish_youtube_sync: {
        Args: {
          p_connection_id: string;
          p_user_id: string;
          p_error_code?: string | null;
        };
        Returns: undefined;
      };
      install_tubemilestones_cron_jobs: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      mark_milestone_celebration_seen: {
        Args: { p_milestone_id: string };
        Returns: undefined;
      };
      read_youtube_refresh_token: {
        Args: { p_connection_id: string; p_user_id: string };
        Returns: string | null;
      };
      store_youtube_refresh_token: {
        Args: {
          p_connection_id: string;
          p_user_id: string;
          p_refresh_token: string;
        };
        Returns: string;
      };
      upsert_youtube_connection_channels: {
        Args: { p_user_id: string; p_connection_id: string; p_channels: Json };
        Returns: Database['public']['Tables']['channels']['Row'][];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database['public'];
export type Tables<Name extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][Name]['Row'];
export type TablesInsert<Name extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][Name]['Insert'];
export type TablesUpdate<Name extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][Name]['Update'];
