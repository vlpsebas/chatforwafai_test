import { Env } from "./types";
import { handleChatRequest } from "./chat";

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
            return env.ASSETS.fetch(request);
        }

        if (url.pathname === "/api/chat") {
            if (request.method === "POST") {
                return handleChatRequest(request, env, ctx);
            }
            return new Response("Method not allowed", { status: 405 });
        }

        return new Response("Not found", { status: 404 });
    },
} satisfies ExportedHandler<Env>;
