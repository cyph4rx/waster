import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createApi, error, noStore } from "./api.mjs";

const { HOST = "127.0.0.1", PORT = "3000", WASTER_PASSWORD, GROQ_API_KEY } = process.env;
const loopback = HOST === "127.0.0.1" || HOST === "::1";
if (!loopback && !WASTER_PASSWORD) {
  throw new Error("Set WASTER_PASSWORD before listening on a public interface.");
}

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/prism.js", ["prism.js", "text/javascript; charset=utf-8"]],
  ["/openai.png", ["openai.png", "image/png"]]
]);

function rateLimit(maximum) {
  let used = 0;
  let resetAt = 0;
  return () => {
    if (Date.now() >= resetAt) {
      used = 0;
      resetAt = Date.now() + 60_000;
    }
    if (used >= maximum) return false;
    used++;
    return true;
  };
}

const handleApi = createApi(process.env, {
  requirePassword: !loopback,
  allowLogin: rateLimit(20),
  allowChat: rateLimit(20)
});
let running = 0;

async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) await pipeline(Readable.fromWeb(response.body), res);
  else res.end();
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const controller = new AbortController();
  const abort = () => controller.abort();
  let reserved = false;
  res.once("close", abort);
  try {
    if (url.pathname.startsWith("/api/")) {
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        signal: controller.signal,
        ...(!["GET", "HEAD"].includes(req.method) ? { body: Readable.toWeb(req), duplex: "half" } : {})
      });
      return await send(res, await handleApi(request, () => {
        if (running >= 3) return false;
        running++;
        reserved = true;
        return true;
      }));
    }
    const file = staticFiles.get(url.pathname);
    if (!file || !["GET", "HEAD"].includes(req.method)) {
      return await send(res, error("Page not found.", 404));
    }
    const contents = await readFile(new URL(file[0], import.meta.url));
    res.writeHead(200, { ...noStore, "Content-Type": file[1], "Content-Length": contents.length });
    res.end(req.method === "HEAD" ? undefined : contents);
  } catch {
    if (!res.headersSent && !res.destroyed) await send(res, error("Wäster could not complete this request.", 500));
    else if (!res.destroyed) res.destroy();
  } finally {
    res.off("close", abort);
    if (reserved) running--;
  }
}).listen(Number(PORT), HOST, () => {
  console.log("Wäster is listening on port " + PORT + (GROQ_API_KEY ? "" : " (GROQ_API_KEY is missing)."));
});
