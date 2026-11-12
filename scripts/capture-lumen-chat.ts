/**
 * Manual capture script for the Lumen AI Chat API. NEVER run in CI, and never
 * run without explicit user approval.
 *
 * WARNING: This makes LIVE, CREDITED calls against the Lumen staging gateway.
 * It lists instances (1 credit), opens a session (2 credits), and sends one
 * message (5 credits) — real credits are charged on every 2xx. It requires
 * staging credentials with the AI Chat grant in `.env.local`
 * (LUMEN_API_KEY, LUMEN_API_SECRET, LUMEN_AI_CHAT_BASE_URL, and optionally
 * LUMEN_AI_INSTANCE_ID). Do not commit any captured response that contains real
 * personal data; the fixtures in src/lib/lumen/__fixtures__/chat are synthetic
 * and must stay that way unless a captured file is scrubbed first.
 *
 * Usage (only after the user has approved spending credits):
 *   npx tsx scripts/capture-lumen-chat.ts "What are your support hours?"
 *
 * It writes raw responses to src/lib/lumen/__fixtures__/chat/captured/ for
 * review. Compare them against chat-schemas.ts; if the docs and the capture
 * disagree, stop and report to the user before changing the schemas.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.LUMEN_AI_CHAT_BASE_URL;
const API_KEY = process.env.LUMEN_API_KEY;
const API_SECRET = process.env.LUMEN_API_SECRET;
const OUT_DIR = join(
  process.cwd(),
  "src",
  "lib",
  "lumen",
  "__fixtures__",
  "chat",
  "captured",
);

function assertEnv(): { base: string; key: string; secret: string } {
  if (!BASE || !API_KEY || !API_SECRET) {
    throw new Error(
      "Set LUMEN_AI_CHAT_BASE_URL, LUMEN_API_KEY and LUMEN_API_SECRET in .env.local before running.",
    );
  }
  if (!BASE.startsWith("https://")) {
    throw new Error("LUMEN_AI_CHAT_BASE_URL must be an https URL.");
  }
  return { base: BASE, key: API_KEY, secret: API_SECRET };
}

async function call(
  env: { base: string; key: string; secret: string },
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${env.base}${path}`, {
    ...init,
    headers: {
      "lumen-api-key": env.key,
      "lumen-api-secret": env.secret,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Request ${path} failed with status ${response.status}.`);
  }
  return body;
}

async function save(name: string, body: unknown): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    join(OUT_DIR, `${name}.json`),
    JSON.stringify(body, null, 2),
    "utf8",
  );
  console.log(`Saved ${name}.json`);
}

async function main(): Promise<void> {
  const env = assertEnv();
  const message = process.argv[2] ?? "What are your support hours?";

  const instances = (await call(env, "/instances")) as {
    Instances: { InstanceID: string }[];
  };
  await save("instances", instances);

  const instanceId =
    process.env.LUMEN_AI_INSTANCE_ID ?? instances.Instances[0]?.InstanceID;
  if (!instanceId) throw new Error("No AI Chat instance available.");

  const session = (await call(env, `/instances/${instanceId}/sessions`, {
    method: "POST",
    body: JSON.stringify({ title: "capture script session" }),
  })) as { Session: { id: string } };
  await save("session", session);

  const answer = await call(
    env,
    `/instances/${instanceId}/sessions/${session.Session.id}/messages`,
    { method: "POST", body: JSON.stringify({ message }) },
  );
  await save("message", answer);

  const transcript = await call(
    env,
    `/instances/${instanceId}/sessions/${session.Session.id}/messages?limit=50`,
  );
  await save("transcript", transcript);

  console.log(
    "Done. Review captured files, scrub any real data, and compare against chat-schemas.ts.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
