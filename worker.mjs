import { createApi } from "./api.mjs";

export default {
  fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    const handleApi = createApi(env, {
      requirePassword: true,
      async allowLogin(request) {
        const key = request.headers.get("cf-connecting-ip") || "local";
        return (await env.LOGIN_LIMIT.limit({ key })).success;
      },
      async allowChat() {
        return (await env.CHAT_LIMIT.limit({ key: "waster-chat" })).success;
      }
    });
    return handleApi(request);
  }
};
