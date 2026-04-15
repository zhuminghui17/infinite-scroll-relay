import { randomUUID } from 'crypto';

export interface PrintSessionRecord {
  id: string;
  createdAt: string;
  durationMs: number;
  signalCount: number;
  totalDistance: number;
  scrollDepthCm: number;
  accumulatedDistanceCm: number;
  scrollTouchCount: number;
  success: boolean;
  errorMessage?: string;
}

const sessions: PrintSessionRecord[] = [];

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function buildRecordFromSessionEnd(body: unknown, result: unknown): PrintSessionRecord {
  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const res = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
  const errMsg =
    typeof res.error === 'string'
      ? res.error
      : typeof res.error === 'object' && res.error !== null && 'message' in res.error
        ? String((res.error as { message?: unknown }).message)
        : undefined;
  const success = !errMsg && res.ok !== false;

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    durationMs: num(payload.durationMs),
    signalCount: num(payload.signalCount),
    totalDistance: num(payload.totalDistance),
    scrollDepthCm: num(payload.scrollDepthCm),
    accumulatedDistanceCm: num(payload.accumulatedDistanceCm, num(payload.scrollDepthCm)),
    scrollTouchCount: num(payload.scrollTouchCount, num(payload.signalCount)),
    success,
    errorMessage: errMsg,
  };
}

export function appendPrintSession(record: PrintSessionRecord): void {
  sessions.push(record);
}

export function getRecentPrintSessions(): readonly PrintSessionRecord[] {
  return sessions;
}
