# Hea Radio

Try the web app here! It's now on live:
https://hea-radio-frontend.vercel.app

Full-stack radio livestream app:

- `server/` - Express backend that proxies the Radio Garden stream
- `client/` - React frontend built with Vite
- `cms/` - Payload CMS application for managing radio channels

## Run the backend

```sh
cd server
npm start
```

The API runs at `http://localhost:3001`.

## Run the frontend

In another terminal:

```sh
cd client
npm run dev
```

Open the Vite URL shown in the terminal, usually
`http://localhost:5173`. Press the play button to start the live stream.

## Backend API

- `GET /health` - backend health check
- `GET /api/channels` - available radio channels
- `GET /api/stream?channel=1` - proxied live audio stream, using the Payload document ID

Channel IDs, names, frequencies, stream URLs, enabled status, and display
order are managed in the Payload CMS `Radio Channels` collection.

## Run the CMS

The CMS requires PostgreSQL. Copy `cms/.env.example` to `cms/.env`, set
`DATABASE_URI` and `PAYLOAD_SECRET`, then run:

```sh
cd cms
npm install
npm run dev
```

Open `http://localhost:3000/admin` to create the first administrator and manage
the `Radio Channels` collection. To use CMS-managed channels in the backend,
set `PAYLOAD_URL` in `server/.env` (and `PAYLOAD_API_TOKEN` if the CMS API is
private). The backend requires Payload to be available and does not use
hard-coded channel data.
