import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import express from "express";
import cors from "cors";
import "dotenv/config";

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";
const PAYLOAD_URL = process.env.PAYLOAD_URL?.replace(/\/$/, "");
const PAYLOAD_API_TOKEN = process.env.PAYLOAD_API_TOKEN;
const CHANNEL_CACHE_TTL_MS = 30_000;
const PAYLOAD_REQUEST_TIMEOUT_MS = 10_000;
let channelCache = null;
let channelCacheExpiresAt = 0;

const app = express();
const corsMiddleware = cors({
  origin: ALLOWED_ORIGIN,
  methods: ["GET", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  maxAge: 86_400,
});

app.use(corsMiddleware);

async function proxyStream(request, response, next) {
  const channelRecordId = request.query.channel;
  if (!channelRecordId) {
    response.status(400).json({
      error: "A channel ID is required.",
    });
    return;
  }
  let channels;

  try {
    channels = await getChannelConfig();
  } catch (error) {
    next(error);
    return;
  }

  const channel = channels[channelRecordId];

  if (!channel) {
    response.status(400).json({
      error: "Unknown radio channel.",
    });
    return;
  }

  const controller = new AbortController();
  const abortUpstream = () => controller.abort();
  const cleanup = () => {
    request.removeListener("aborted", abortUpstream);
    response.removeListener("close", abortUpstream);
  };

  request.once("aborted", abortUpstream);
  response.once("close", abortUpstream);

  try {
    const upstream = await fetch(channel.url, {
      signal: controller.signal,
      headers: {
        Accept: "audio/mpeg, audio/*;q=0.9, */*;q=0.8",
      },
    });

    if (!upstream.ok || !upstream.body) {
      response.status(502).json({
        error: "The upstream radio stream is unavailable.",
      });
      return;
    }

    response.set({
      "Cache-Control": "no-store",
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
    });

    for (const headerName of ["content-length", "icy-br", "icy-description", "icy-genre", "icy-name"]) {
      const value = upstream.headers.get(headerName);
      if (value) {
        response.setHeader(headerName, value);
      }
    }

    await pipeline(Readable.fromWeb(upstream.body), response);
  } catch (error) {
    const clientDisconnected =
      controller.signal.aborted ||
      error.name === "AbortError" ||
      error.code === "ERR_STREAM_PREMATURE_CLOSE";

    if (clientDisconnected) {
      return;
    }

    if (!response.headersSent) {
      next(error);
    }
  } finally {
    cleanup();
  }
}

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/channels", async (_request, response, next) => {
  try {
    response.json(await getChannels());
  } catch (error) {
    console.error("Unable to load radio channels from Payload:", error);
    response.status(502).json({
      error: "Unable to load radio channels from the CMS.",
    });
  }
});

app.get("/api/stream", proxyStream);

app.use((_request, response) => {
  response.status(404).json({ error: "Route not found." });
});

app.use((error, _request, response, _next) => {
  console.error("Unable to proxy radio stream:", error);
  if (!response.headersSent) {
    response.status(502).json({
      error: "Unable to connect to the upstream radio stream.",
    });
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log(`HK radio backend listening on http://${HOST}:${PORT}`);
});

async function getChannels() {
  return serializeChannels(await getChannelConfig());
}

async function getChannelConfig() {
  if (!PAYLOAD_URL) {
    throw new Error("PAYLOAD_URL is required to load radio channels.");
  }

  if (channelCache && channelCacheExpiresAt > Date.now()) {
    return channelCache;
  }

  const headers = { Accept: "application/json" };
  if (PAYLOAD_API_TOKEN) {
    headers.Authorization = "Bearer " + PAYLOAD_API_TOKEN;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAYLOAD_REQUEST_TIMEOUT_MS);
  let cmsResponse;

  try {
    cmsResponse = await fetch(
      `${PAYLOAD_URL}/api/radio-channels?where%5Benabled%5D%5Bequals%5D=true&sort=sortOrder&limit=100`,
      { headers, signal: controller.signal },
    );
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Payload request timed out after ${PAYLOAD_REQUEST_TIMEOUT_MS}ms.`);
    }
    throw new Error(`Unable to reach Payload CMS: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!cmsResponse.ok) {
    throw new Error(`Payload returned HTTP ${cmsResponse.status}.`);
  }

  const payload = await cmsResponse.json();
  const channels = (payload.docs ?? []).reduce((result, entry) => {
    const id = String(entry.id ?? "");
    if (!id || !entry.streamUrl || entry.enabled === false) return result;

    result[id] = {
      name: entry.name,
      band: entry.band,
      frequency: entry.frequency ?? "",
      url: entry.streamUrl,
      sortOrder: entry.sortOrder ?? 0,
    };
    return result;
  }, {});

  channelCache = channels;
  channelCacheExpiresAt = Date.now() + CHANNEL_CACHE_TTL_MS;
  return channelCache;
}

function serializeChannels(channels) {
  return Object.entries(channels)
    .sort(([, first], [, second]) => (first.sortOrder ?? 0) - (second.sortOrder ?? 0))
    .map(([id, channel]) => ({
      id,
      name: channel.name,
      band: channel.band,
      frequency: channel.frequency,
    }));
}

server.requestTimeout = 0;
server.headersTimeout = 30_000;

function shutdown(signal) {
  console.log(`${signal} received, shutting down.`);
  server.close(() => process.exit(0));
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
