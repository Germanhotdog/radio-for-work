# HK Radio CMS

Payload CMS for managing the radio channels used by the Express backend.

## Local setup

1. Create a PostgreSQL database.
2. Copy `.env.example` to `.env`.
3. Set `DATABASE_URI` and a long random `PAYLOAD_SECRET`.
4. Install dependencies and start the CMS:

```sh
npm install
npm run dev
```

Open [http://localhost:3000/admin](http://localhost:3000/admin) to create the
first administrator. Add records in **Radio Channels**. Enabled channels are
returned by the CMS API and consumed by the backend.
