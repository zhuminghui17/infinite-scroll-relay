import type { Request } from 'express';

export type RelayLogLevel = 'info' | 'warn' | 'error';

export interface RelayLogEntry {
  ts: string;
  level: RelayLogLevel;
  message: string;
}

const entries: RelayLogEntry[] = [];

export function getRelayLogs(): readonly RelayLogEntry[] {
  return entries;
}

export function relayLog(level: RelayLogLevel, message: string): void {
  const line = `[relay] ${message}`;
  entries.push({ ts: new Date().toISOString(), level, message });
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function checkLogToken(req: Request): boolean {
  const token = process.env.RELAY_LOG_TOKEN;
  if (!token) return true;
  const q = req.query.token;
  const fromQuery = typeof q === 'string' ? q : Array.isArray(q) ? q[0] : undefined;
  const auth = req.headers.authorization;
  const fromHeader = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  return fromQuery === token || fromHeader === token;
}
