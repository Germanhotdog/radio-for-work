# HK Radio Backend

Small Node.js backend for the radio livestream. It keeps the upstream stream URL
on the server and exposes it to the future React frontend through a
same-origin-friendly proxy.

## Requirements

- Node.js 18 or newer

## Run locally

```sh
cd server
npm start
```

The server listens on `http://localhost:3001` by default.

## Endpoints

- `GET /health` - returns `{ "status": "ok" }`
- `GET /api/channels` - returns enabled channels from Payload CMS
- `GET /api/stream` - proxies the configured radio stream as audio

Set `PAYLOAD_URL` to the CMS base URL and optionally set `PAYLOAD_API_TOKEN` for
authenticated server-to-server access. Payload document IDs identify channels;
channel names and stream URLs are
managed exclusively in Payload CMS; the backend has no hard-coded channel
fallback. The server loads variables from `server/.env` during local development.

```sh
PAYLOAD_URL=http://localhost:3000 ALLOWED_ORIGIN=http://localhost:5173 npm start
```
