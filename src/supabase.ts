import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { PrintSessionRecord } from './printSession';
import { relayLog } from './logger';

let client: SupabaseClient | null | undefined;

function envTrim(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

function readSupabaseUrl(): string | undefined {
  return envTrim(process.env.SUPABASE_URL);
}

function readSupabaseKey(): string | undefined {
  return (
    envTrim(process.env.SUPABASE_SERVICE_ROLE_KEY) ??
    envTrim(process.env.SUPABASE_ANON_KEY) ??
    envTrim(process.env.SUPABASE_PUBLISHABLE_KEY)
  );
}

function getClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = readSupabaseUrl();
  const key = readSupabaseKey();
  if (!url || !key) {
    client = null;
    return null;
  }
  client = createClient(url, key);
  return client;
}

/** Why Supabase is disabled — safe to log (no secrets). */
export function supabaseEnvGap(): string | null {
  const url = readSupabaseUrl();
  const key = readSupabaseKey();
  if (url && key) return null;
  if (!url && !key) {
    return 'SUPABASE_URL and a Supabase key are missing or empty after trim';
  }
  if (!url) return 'SUPABASE_URL is missing or empty';
  return 'set a non-empty SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, or SUPABASE_PUBLISHABLE_KEY';
}

function mapRow(row: {
  id: string;
  created_at: string;
  duration_ms: number;
  signal_count: number;
  total_distance: number;
  scroll_depth_cm: number;
  accumulated_distance_cm: number;
  scroll_touch_count: number;
  success: boolean;
  error_message: string | null;
}): PrintSessionRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    durationMs: row.duration_ms,
    signalCount: row.signal_count,
    totalDistance: row.total_distance,
    scrollDepthCm: row.scroll_depth_cm,
    accumulatedDistanceCm: row.accumulated_distance_cm,
    scrollTouchCount: row.scroll_touch_count,
    success: row.success,
    errorMessage: row.error_message ?? undefined,
  };
}

const PAGE_SIZE = 1000;

export async function fetchPrintSessionsFromSupabase(): Promise<PrintSessionRecord[]> {
  const c = getClient();
  if (!c) {
    throw new Error('Supabase not configured');
  }
  const out: PrintSessionRecord[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await c
      .from('print_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw error;
    }
    if (!data?.length) {
      break;
    }
    for (const row of data) {
      out.push(mapRow(row as Parameters<typeof mapRow>[0]));
    }
    if (data.length < PAGE_SIZE) {
      break;
    }
    from += PAGE_SIZE;
  }
  return out;
}

export function isSupabaseConfigured(): boolean {
  return getClient() !== null;
}

export async function recordPrintSessionToSupabase(row: PrintSessionRecord): Promise<void> {
  const c = getClient();
  if (!c) return;

  const { error } = await c.from('print_sessions').insert({
    id: row.id,
    created_at: row.createdAt,
    duration_ms: row.durationMs,
    signal_count: row.signalCount,
    total_distance: row.totalDistance,
    scroll_depth_cm: row.scrollDepthCm,
    accumulated_distance_cm: row.accumulatedDistanceCm,
    scroll_touch_count: row.scrollTouchCount,
    success: row.success,
    error_message: row.errorMessage ?? null,
  });

  if (error) {
    relayLog('error', `Supabase insert failed: ${error.message}`);
  }
}
