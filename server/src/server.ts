// Hearer Memory API server entry-point.
//
// All routes live in app.ts; this file just wires storage + the production
// LLM provider and starts the listener. SQLite is preferred; JSON fallback
// is automatic when the native binding isn't available.

import "./llm/llmConfig"; // load .env once on boot
import { openStorage } from "./db";
import { buildApp } from "./app";

const PORT = Number(process.env.HEARER_API_PORT ?? 8788);
const HOST = process.env.HEARER_API_HOST ?? "0.0.0.0";
const PREFER_JSON = process.env.HEARER_API_STORAGE === "json";

async function start(): Promise<void> {
  const storage = await openStorage({ preferJson: PREFER_JSON });
  const app = buildApp({ storage, logger: true });

  await app.listen({ port: PORT, host: HOST });
  app.log.info(
    `Hearer Memory API listening on http://${
      HOST === "0.0.0.0" ? "localhost" : HOST
    }:${PORT} (storage=${storage.kind})`
  );

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down…`);
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Hearer Memory API failed to start:", err);
  process.exit(1);
});
