import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

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
    console.log(`[relay] Printer connected: ${id}`);

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
        console.error('[relay] Failed to parse printer message:', err);
      }
    });

    ws.on('close', () => {
      console.log(`[relay] Printer disconnected: ${id}`);
      if (printerConnection?.id === id) {
        printerConnection = null;
      }
    });

    ws.on('error', (err) => {
      console.error(`[relay] Printer WebSocket error:`, err);
    });

    ws.send(JSON.stringify({ type: 'connected', id }));
  } else {
    console.log('[relay] Unknown client connected, closing');
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
    const result = await sendToPrinter('health', {}, 5000);
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
    console.error('[relay] Scroll forward failed:', err.message);
    res.status(503).json({ error: err.message });
  }
});

// Session end endpoint - forward to printer
app.post('/session/end', async (req, res) => {
  try {
    const result = await sendToPrinter('session/end', req.body);
    res.json(result);
  } catch (err: any) {
    console.error('[relay] Session end forward failed:', err.message);
    res.status(503).json({ error: err.message });
  }
});

// Print test endpoint
app.post('/print/test', async (req, res) => {
  try {
    const result = await sendToPrinter('print/test', req.body);
    res.json(result);
  } catch (err: any) {
    console.error('[relay] Print test forward failed:', err.message);
    res.status(503).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[relay] Server listening on port ${PORT}`);
  console.log(`[relay] WebSocket endpoint: ws://localhost:${PORT}/gateway?type=printer`);
  console.log(`[relay] HTTP endpoints: /health, /scroll, /session/end, /print/test`);
});
