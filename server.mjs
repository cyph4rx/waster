import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const { GROQ_API_KEY, WASTER_PASSWORD, HOST = "127.0.0.1", PORT = "3000" } = process.env;
const personality = process.env.WASTER_PERSONALITY?.trim();
const systemMessage = personality ? { role: "system", content: personality } : null;
const systemBudget = systemMessage ? Buffer.byteLength(systemMessage.content, "utf8") + 32 : 0;
const loopback = HOST === "127.0.0.1" || HOST === "::1";
if (!loopback && !WASTER_PASSWORD) {
  throw new Error("Set WASTER_PASSWORD before listening on a public interface.");
}

// Groq's model pages provide the context and completion limits.
const models = [
  { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B", brand: "qwen", context: 131042, output: 16384, effort: "none" },
  { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", brand: "openai", context: 131072, output: 65536, effort: "low" },
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", brand: "openai", context: 131072, output: 65536, effort: "low" }
];
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/prism.js", ["prism.js", "text/javascript; charset=utf-8"]],
  ["/openai.png", ["openai.png", "image/png"]]
]);
const hash = string => createHash("sha256").update(string).digest();
const passwordHash = WASTER_PASSWORD ? hash(WASTER_PASSWORD) : null;
const signingKey = GROQ_API_KEY
  ? createHmac("sha256", GROQ_API_KEY).update("waster session:" + WASTER_PASSWORD).digest()
  : randomBytes(32);
let loginFailures = 0;
let loginResetAt = 0;
let running = 0;
let requests = 0;
let resetAt = Date.now() + 60_000;

function json(res, code, payload) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function error(res, code, message) {
  json(res, code, { error: { message } });
}

async function readJson(req, res, limit) {
  if (req.headers["sec-fetch-site"] === "cross-site" || !/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")) {
    return error(res, 415, "Send a same-origin JSON request.");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) {
      res.setHeader("Connection", "close");
      return error(res, 413, "This request is too large.");
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return error(res, 400, "Invalid JSON request."); }
}

function sign(session) {
  return createHmac("sha256", signingKey).update(session).digest("hex");
}

function hasSession(req) {
  if (!passwordHash) return true;
  const token = /^Bearer (\d+\.[\da-f]{32})\.([\da-f]{64})$/i.exec(req.headers.authorization ?? "");
  if (!token || Number(token[1].split(".")[0]) <= Date.now()) return false;
  return timingSafeEqual(Buffer.from(token[2], "hex"), Buffer.from(sign(token[1]), "hex"));
}

async function login(req, res) {
  if (!passwordHash) return error(res, 400, "This server does not require a password.");
  if (Date.now() >= loginResetAt) {
    loginResetAt = Date.now() + 60_000;
    loginFailures = 0;
  }
  if (loginFailures >= 20) return error(res, 429, "Too many sign-in attempts. Try again in a moment.");
  const input = await readJson(req, res, 4096);
  if (res.writableEnded) return;
  if (typeof input?.password !== "string" || !timingSafeEqual(passwordHash, hash(input.password))) {
    loginFailures++;
    return error(res, 401, "That password didn’t match.");
  }
  const session = (Date.now() + 12 * 60 * 60 * 1000) + "." + randomBytes(16).toString("hex");
  return json(res, 200, { token: session + "." + sign(session) });
}

async function chat(req, res) {
  if (!hasSession(req)) return error(res, 401, "Sign in to Wäster to send a message.");
  if (!GROQ_API_KEY) return error(res, 503, "Set GROQ_API_KEY on the Wäster server to start chatting.");
  const input = await readJson(req, res, 1024 * 1024);
  if (res.writableEnded) return;
  const model = models.find(item => item.id === input?.model);
  const messages = input?.messages;
  if (!model || !Array.isArray(messages) || messages.length > 500 || messages.at(-1)?.role !== "user" ||
      messages.some(message => !message || !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" || !message.content.trim())) {
    return error(res, 400, "Choose a supported model and send a message.");
  }
  const completion = Math.min(model.output, 4096);
  // Conservative text budget using UTF-8 byte counts plus message framing.
  // Groq applies the exact token limit with its model tokenizer.
  const budget = model.context - completion - 128 - systemBudget;
  const window = [];
  let count = 0;
  for (let index = messages.length - 1; index >= 0; index--) {
    const { role, content } = messages[index];
    count += Buffer.byteLength(content, "utf8") + 32;
    if (count > budget) break;
    window.unshift({ role, content });
  }
  if (!window.length) return error(res, 400, "This message exceeds the selected model’s context limit.");
  if (window[0].role === "assistant") window.shift();
  if (systemMessage) window.unshift(systemMessage);
  if (Date.now() >= resetAt) {
    requests = 0;
    resetAt = Date.now() + 60_000;
  }
  if (running >= 3 || requests >= 20) return error(res, 429, "Too many requests. Try again in a moment.");
  running++;
  requests++;
  const controller = new AbortController();
  const abort = () => controller.abort();
  res.once("close", abort);
  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + GROQ_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.id, messages: window, stream: true, max_completion_tokens: completion,
        reasoning_effort: model.effort
      }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)])
    });
    if (!upstream.ok) {
      const detail = await upstream.json().catch(() => null);
      if (upstream.status === 401) return error(res, 502, "Groq rejected the server’s API key.");
      if (upstream.status === 429) return error(res, 429, "Groq rate limit reached. Try again in a moment.");
      if (detail?.error?.code === "context_length_exceeded") {
        return error(res, 400, "This conversation exceeds the model’s context limit. Start a new chat.");
      }
      return error(res, 502, "Groq could not reply with this model. Check the model’s permissions or try another.");
    }
    res.writeHead(200, { "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch {
    if (!res.headersSent && !res.destroyed) error(res, 502, "The connection to Groq ended before a reply arrived.");
  } finally {
    res.off("close", abort);
    running--;
  }
}

createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (req.method === "POST" && pathname === "/api/chat") return await chat(req, res);
    if (req.method === "POST" && pathname === "/api/sign-in") return await login(req, res);
    if (req.method === "GET" && pathname === "/api/models") {
      return json(res, 200, {
        configured: Boolean(GROQ_API_KEY),
        signInRequired: Boolean(passwordHash),
        models: models.map(({ effort, ...model }) => model)
      });
    }
    const file = staticFiles.get(pathname);
    if (!file || !["GET", "HEAD"].includes(req.method)) return error(res, 404, "Page not found.");
    const contents = await readFile(new URL(file[0], import.meta.url));
    res.writeHead(200, { "Content-Type": file[1], "Content-Length": contents.length });
    res.end(req.method === "HEAD" ? undefined : contents);
  } catch {
    if (!res.headersSent && !res.destroyed) error(res, 500, "Wäster could not complete this request.");
    else if (!res.destroyed) res.destroy();
  }
}).listen(Number(PORT), HOST, () => {
  console.log("Wäster is listening on port " + PORT + (GROQ_API_KEY ? "" : " (GROQ_API_KEY is missing)."));
});
