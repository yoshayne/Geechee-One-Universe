import http from "http";
import https from "https";
import dns from "dns";
import net from "net";

// Downloads a URL while refusing private, local and internal network addresses.
// The address check happens at connection time, so it also stops DNS tricks.

const blocked = new net.BlockList();
for (const [ip, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as [string, number][]) {
  blocked.addSubnet(ip, bits, "ipv4");
}
for (const [ip, bits] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as [string, number][]) {
  blocked.addSubnet(ip, bits, "ipv6");
}

export class FetchError extends Error {}

function isBlockedAddress(addr: string): boolean {
  const mapped = addr.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  const family = net.isIP(addr);
  if (!family) return true;
  return blocked.check(addr, family === 4 ? "ipv4" : "ipv6");
}

const safeLookup: any = (hostname: string, options: any, cb: any) => {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) {
      return cb(new FetchError("Address not allowed"));
    }
    if (options && options.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
};

function once(u: URL, maxBytes: number, timeoutMs: number, accept: string) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    const timer = setTimeout(() => req.destroy(new FetchError("Timed out")), timeoutMs);
    const req = lib.request(
      u,
      {
        method: "GET",
        lookup: safeLookup,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GeecheeOneUniverseBot/1.0)",
          Accept: accept,
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(new FetchError("Too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          clearTimeout(timer);
          resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) });
        });
        res.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
      }
    );
    req.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.end();
  });
}

export async function safeGet(
  rawUrl: string,
  opts: { maxBytes: number; timeoutMs?: number; accept?: string }
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer; finalUrl: string }> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new FetchError("Invalid URL");
  }
  const deadline = Date.now() + (opts.timeoutMs ?? 5000);
  for (let hop = 0; hop < 5; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") throw new FetchError("Only http and https links are allowed");
    const port = current.port || (current.protocol === "https:" ? "443" : "80");
    if (port !== "80" && port !== "443") throw new FetchError("Port not allowed");
    const host = current.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && isBlockedAddress(host)) throw new FetchError("Address not allowed");
    const remaining = Math.max(deadline - Date.now(), 1);
    const res = await once(current, opts.maxBytes, remaining, opts.accept || "*/*");
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) {
      current = new URL(res.headers.location, current);
      continue;
    }
    return { ...res, finalUrl: current.toString() };
  }
  throw new FetchError("Too many redirects");
}
