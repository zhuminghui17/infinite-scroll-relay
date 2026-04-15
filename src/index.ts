import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { relayLog, checkLogToken, getRelayLogs } from './logger';
import { appendPrintSession, buildRecordFromSessionEnd, getRecentPrintSessions } from './printSession';
import {
  isSupabaseConfigured,
  recordPrintSessionToSupabase,
  fetchPrintSessionsFromSupabase,
} from './supabase';
import { LOGS_UI_HTML, SESSIONS_UI_HTML } from './uiHtml';

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/gateway' });

interface PrinterConnection {
  ws: WebSocket;
  id: string;
  connectedAt: number;
}

let printerConnection: PrinterConnection | null = null;
const pendingResponses = new Map<string, (response: any) => void>();

wss.on('connection', (ws, req) => {
  const clientType = req.url?.includes('?type=printer') ? 'printer' : 'unknown';
  
  if (clientType === 'printer') {
    const id = `printer_${Date.now()}`;
    printerConnection = { ws, id, connectedAt: Date.now() };
    relayLog('info', `Printer connected: ${id}`);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'response' && message.requestId) {
          const resolve = pendingResponses.get(message.requestId);
          if (resolve) {
            resolve(message.data);
            pendingResponses.delete(message.requestId);
          }
        } else if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (err) {
        relayLog('error', `Failed to parse printer message: ${err}`);
      }
    });

    ws.on('close', () => {
      relayLog('info', `Printer disconnected: ${id}`);
      if (printerConnection?.id === id) {
        printerConnection = null;
      }
    });

    ws.on('error', (err) => {
      relayLog('error', `Printer WebSocket error: ${err}`);
    });

    ws.send(JSON.stringify({ type: 'connected', id }));
  } else {
    relayLog('warn', 'Unknown client connected, closing');
    ws.close();
  }
});

async function sendToPrinter(action: string, payload: any, timeout = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!printerConnection || printerConnection.ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Printer not connected'));
      return;
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timer = setTimeout(() => {
      pendingResponses.delete(requestId);
      reject(new Error('Request timeout'));
    }, timeout);

    pendingResponses.set(requestId, (response) => {
      clearTimeout(timer);
      resolve(response);
    });

    printerConnection.ws.send(JSON.stringify({
      type: 'request',
      requestId,
      action,
      payload,
    }));
  });
}

// Health check - asks gateway for real printer status
app.get('/health', async (_req, res) => {
  const gatewayConnected = printerConnection !== null && 
    printerConnection.ws.readyState === WebSocket.OPEN;
  
  if (!gatewayConnected) {
    res.json({
      ok: true,
      gatewayConnected: false,
      printerConnected: false,
    });
    return;
  }

  try {
    const result = await sendToPrinter('health', {}, 3000);
    res.json({
      ok: true,
      gatewayConnected: true,
      printerConnected: result.printerOnline === true,
      printerConnectedAt: printerConnection?.connectedAt ?? null,
    });
  } catch {
    res.json({
      ok: true,
      gatewayConnected: true,
      printerConnected: false,
    });
  }
});

// Scroll endpoint - forward to printer
app.post('/scroll', async (req, res) => {
  try {
    const result = await sendToPrinter('scroll', req.body);
    res.json(result);
  } catch (err: any) {
    relayLog('error', `Scroll forward failed: ${err.message}`);
    res.status(503).json({ error: err.message });
  }
});

// Session end endpoint - forward to printer
app.post('/session/end', async (req, res) => {
  try {
    const result = await sendToPrinter('session/end', req.body);
    const record = buildRecordFromSessionEnd(req.body, result);
    appendPrintSession(record);
    void recordPrintSessionToSupabase(record);
    res.json(result);
  } catch (err: any) {
    const record = buildRecordFromSessionEnd(req.body, { error: err.message });
    appendPrintSession(record);
    void recordPrintSessionToSupabase(record);
    relayLog('error', `Session end forward failed: ${err.message}`);
    res.status(503).json({ error: err.message });
  }
});

// Print test endpoint
app.post('/print/test', async (req, res) => {
  try {
    const result = await sendToPrinter('print/test', req.body);
    res.json(result);
  } catch (err: any) {
    relayLog('error', `Print test forward failed: ${err.message}`);
    res.status(503).json({ error: err.message });
  }
});

app.get('/logs', (req, res) => {
  if (!checkLogToken(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json({ entries: getRelayLogs() });
});

app.get('/sessions', async (req, res) => {
  if (!checkLogToken(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (isSupabaseConfigured()) {
    try {
      const sessions = await fetchPrintSessionsFromSupabase();
      res.json({ source: 'supabase', sessions });
    } catch (err: any) {
      relayLog('error', `Sessions list failed: ${err.message}`);
      res.status(503).json({ error: err.message });
    }
    return;
  }
  res.json({ source: 'memory', sessions: getRecentPrintSessions() });
});

app.get('/sessions/ui', (req, res) => {
  if (!checkLogToken(req)) {
    res.status(401).send('Unauthorized');
    return;
  }
  res.type('html').send(SESSIONS_UI_HTML);
});

app.get('/logs/ui', (req, res) => {
  if (!checkLogToken(req)) {
    res.status(401).send('Unauthorized');
    return;
  }
  res.type('html').send(LOGS_UI_HTML);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  const supabaseOk = isSupabaseConfigured();
  relayLog('info', `Server listening on port ${PORT}`);
  relayLog('info', `WebSocket: ws://localhost:${PORT}/gateway?type=printer`);
  if (supabaseOk) {
    let host = '';
    try {
      const u = process.env.SUPABASE_URL;
      if (u) host = new URL(u).host;
    } catch {
      /* ignore */
    }
    relayLog(
      'info',
      `Supabase: connected · table print_sessions · ${host || process.env.SUPABASE_URL}`,
    );
  } else {
    relayLog(
      'warn',
      'Supabase: not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, or SUPABASE_PUBLISHABLE_KEY)',
    );
  }
  relayLog(
    'info',
    `HTTP: /health, /scroll, /session/end, /print/test, /logs, /logs/ui, /sessions, /sessions/ui${
      supabaseOk ? ' (Supabase: print_sessions)' : ''
    }`,
  );
});
