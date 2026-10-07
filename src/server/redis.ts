import Redis from "ioredis";

let client: Redis | null = null;
let warned = false;

function warnOnce(msg: string) {
  if (!warned) {
    warned = true;
    console.warn(msg);
  }
}

if (process.env.REDIS_URL) {
  client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 1000, 10000),
  });
  client.on("error", (err) => warnOnce(`Redis unavailable, rate limiting is off: ${err.message}`));
} else {
  warnOnce("REDIS_URL not set, rate limiting is off.");
}

// Returns true if the request is allowed. If Redis is down, always allows.
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  if (!client || client.status !== "ready") return true;
  try {
    const k = `rl:${key}`;
    const count = await client.incr(k);
    if (count === 1) await client.expire(k, windowSeconds);
    return count <= max;
  } catch {
    return true;
  }
}

export async function clearRateLimit(key: string) {
  if (!client || client.status !== "ready") return;
  try {
    await client.del(`rl:${key}`);
  } catch {
    /* ignore */
  }
}
