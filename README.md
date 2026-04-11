# Infinite Scroll Relay Server

WebSocket relay server that bridges the mobile browser app and the printer gateway.

## Architecture

```
┌─────────────┐      ┌─────────────────┐      ┌─────────────┐
│   Mobile    │      │  Relay Server   │      │   Gateway   │
│   Browser   │ HTTP │  (This Server)  │  WS  │  (Pi/Mac)   │
│     App     │ ───> │                 │ <─── │   Printer   │
└─────────────┘      └─────────────────┘      └─────────────┘
```

## Local Development

```bash
npm install
npm run dev
```

## Deployment

### Railway

1. Connect your GitHub repo to Railway
2. Railway will auto-detect and deploy
3. Note your deployment URL (e.g., `https://your-app.railway.app`)

### Render

1. Create a new Web Service
2. Connect your repo
3. Build Command: `npm install && npm run build`
4. Start Command: `npm start`

### Fly.io

```bash
fly launch
fly deploy
```

## Environment Variables

- `PORT` - Server port (default: 3001)

## Endpoints

### HTTP (for mobile app)

- `GET /health` - Health check, shows printer connection status
- `POST /scroll` - Forward scroll event to printer
- `POST /session/end` - End session and print receipt
- `POST /print/test` - Test print

### WebSocket (for printer gateway)

- `ws://host/gateway?type=printer` - Printer gateway connection
