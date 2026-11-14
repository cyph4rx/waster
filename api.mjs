import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

// Groq's model pages provide the context and completion limits.
const models = [
  { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B", brand: "qwen", context: 131042, output: 16384, effort: "none" },
  { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", brand: "openai", context: 131072, output: 65536, effort: "low" },
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", brand: "openai", context: 131072, output: 65536, effort: "low" }
];
const publicModels = models.map(({ effort, ...model }) => model);
export const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: noStore });
}

export function error(message, status) {
  return json({ error: { message } }, status);
}

async function readJson(request, limit) {
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      !/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw error("Send a same-origin JSON request.", 415);
  }
  if (Number(request.headers.get("content-length")) > limit) throw error("This request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw error("Invalid JSON request.", 400);
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        void reader.cancel().catch(() => {});
        throw error("This request is too large.", 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  } catch (failure) {
    if (failure instanceof Response) throw failure;
    throw error("Invalid JSON request.", 400);
  } finally {
    reader.releaseLock();
  }
}

const hash = value => createHash("sha256").update(value).digest();

export function createApi(env, { requirePassword = false, allowLogin, allowChat } = {}) {
  const { GROQ_API_KEY, WASTER_PASSWORD, WASTER_PERSONALITY } = env;
  const personality = WASTER_PERSONALITY?.trim();
  const systemMessage = personality ? { role: "system", content: personality } : null;
  const systemBudget = systemMessage ? Buffer.byteLength(personality, "utf8") + 32 : 0;
  const passwordHash = WASTER_PASSWORD ? hash(WASTER_PASSWORD) : null;
  const signingKey = GROQ_API_KEY
    ? createHmac("sha256", GROQ_API_KEY).update("waster session:" + WASTER_PASSWORD).digest()
    : randomBytes(32);
  const configured = Boolean(GROQ_API_KEY && (!requirePassword || passwordHash));

  function sign(session) {
    return createHmac("sha256", signingKey).update(session).digest();
  }

  function hasSession(request) {
    if (!passwordHash) return !requirePassword;
    const token = /^Bearer (\d+\.[\da-f]{32})\.([\da-f]{64})$/i.exec(request.headers.get("authorization") ?? "");
    if (!token || Number(token[1].split(".")[0]) <= Date.now()) return false;
    return timingSafeEqual(Buffer.from(token[2], "hex"), sign(token[1]));
  }

  async function login(request) {
    if (!passwordHash) return error("Wäster has no site password configured.", 503);
    if (allowLogin && !await allowLogin(request)) return error("Too many sign-in attempts. Try again in a moment.", 429);
    const input = await readJson(request, 4096);
    if (typeof input?.password !== "string" || !timingSafeEqual(passwordHash, hash(input.password))) {
      return error("That password didn’t match.", 401);
    }
    const session = (Date.now() + 12 * 60 * 60 * 1000) + "." + randomBytes(16).toString("hex");
    return json({ token: session + "." + sign(session).toString("hex") });
  }

  async function chat(request, reserveChat) {
    if (requirePassword && !passwordHash) return error("Set WASTER_PASSWORD before accepting chat requests.", 503);
    if (!hasSession(request)) return error("Sign in to Wäster to send a message.", 401);
    if (!GROQ_API_KEY) return error("Set GROQ_API_KEY on the Wäster server to start chatting.", 503);
    const input = await readJson(request, 1024 * 1024);
    const model = models.find(item => item.id === input?.model);
    const messages = input?.messages;
    if (!model || !Array.isArray(messages) || messages.length > 500 || messages.at(-1)?.role !== "user" ||
        messages.some(message => !message || !["user", "assistant"].includes(message.role) ||
          typeof message.content !== "string" || !message.content.trim())) {
      return error("Choose a supported model and send a message.", 400);
    }
    const completion = Math.min(model.output, 4096);
    // Groq enforces the exact token limit. The byte estimate reserves room for the reply and personality.
    const budget = model.context - completion - 128 - systemBudget;
    const history = [];
    let count = 0;
    for (let index = messages.length - 1; index >= 0; index--) {
      const { role, content } = messages[index];
      count += Buffer.byteLength(content, "utf8") + 32;
      if (count > budget) break;
      history.push({ role, content });
    }
    if (!history.length) return error("This message exceeds the selected model’s context limit.", 400);
    while (history.at(-1)?.role === "assistant") history.pop();
    if (systemMessage) history.push(systemMessage);
    history.reverse();
    if ((allowChat && !await allowChat(request)) || (reserveChat && !reserveChat())) {
      return error("Too many requests. Try again in a moment.", 429);
    }

    try {
      const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + GROQ_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.id, messages: history, stream: true, max_completion_tokens: completion,
          reasoning_effort: model.effort
        }),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)])
      });
      if (!upstream.ok) {
        const detail = await upstream.json().catch(() => null);
        if (upstream.status === 401) return error("Groq rejected the server’s API key.", 502);
        if (upstream.status === 429) return error("Groq rate limit reached. Try again in a moment.", 429);
        if (detail?.error?.code === "context_length_exceeded") {
          return error("This conversation exceeds the model’s context limit. Start a new chat.", 400);
        }
        return error("Groq could not reply with this model. Check the model’s permissions or try another.", 502);
      }
      if (!upstream.body) return error("Groq returned an empty reply. Try again.", 502);
      return new Response(upstream.body, {
        headers: { ...noStore, "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" }
      });
    } catch {
      return error("The connection to Groq ended before a reply arrived.", 502);
    }
  }

  return async function handleApi(request, reserveChat) {
    const path = new URL(request.url).pathname;
    try {
      if (request.method === "GET" && path === "/api/models") {
        return json({
          configured,
          signInRequired: requirePassword || Boolean(passwordHash),
          models: publicModels,
          ...(!configured && requirePassword && !passwordHash ? { configurationError: "Set WASTER_PASSWORD on the server to start chatting." } : {})
        });
      }
      if (request.method === "POST" && path === "/api/sign-in") return await login(request);
      if (request.method === "POST" && path === "/api/chat") return await chat(request, reserveChat);
      return error("Page not found.", 404);
    } catch (failure) {
      return failure instanceof Response ? failure : error("Wäster could not complete this request.", 500);
    }
  };
}
