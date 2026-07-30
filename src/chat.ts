import { ChatMessage, Env, CacheOptions } from "./types";
import { parseDLPHeader, buildLogEntry, logDLPEvent } from "./dlp-logger";

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";
const SYSTEM_PROMPT = "You are a helpful, friendly assistant. Provide concise and accurate responses.";

export async function handleChatRequest(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
): Promise<Response> {
    try {
        const { messages = [], cacheOptions = {} } = await request.json() as {
            messages: ChatMessage[];
            cacheOptions?: CacheOptions;
        };

        if (!messages.some((msg) => msg.role === "system")) {
            messages.unshift({ role: "system", content: SYSTEM_PROMPT });
        }

        const lastUserMsg = messages.filter(m => m.role === "user").pop();

        // Use fetch() instead of env.AI.run() to get response headers
        const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${env.ACCOUNT_ID}/${env.GATEWAY_ID}/workers-ai/${MODEL_ID}`;

        // Build gateway request headers with cache controls
        const gatewayHeaders: Record<string, string> = {
            "Authorization": `Bearer ${env.CF_API_TOKEN}`,
            "Content-Type": "application/json",
        };

        // 2c: Per-request cache TTL
        if (cacheOptions.cacheTtl) {
            gatewayHeaders["cf-aig-cache-ttl"] = String(cacheOptions.cacheTtl);
        }

        // 2d: Skip cache when freshness matters
        if (cacheOptions.skipCache) {
            gatewayHeaders["cf-aig-skip-cache"] = "true";
        }

        // 2e: Custom cache key (e.g., campaign ID, widget ID)
        if (cacheOptions.cacheKey) {
            gatewayHeaders["cf-aig-cache-key"] = cacheOptions.cacheKey;
        }

        const aiResponse = await fetch(gatewayUrl, {
            method: "POST",
            headers: gatewayHeaders,
            body: JSON.stringify({ messages, max_tokens: 1024, stream: true }),
        });

        // Parse DLP verdict from gateway response header
        const dlp = parseDLPHeader(aiResponse.headers.get("cf-aig-dlp"));

        // 2b: Capture cache status from gateway response
        const cacheStatus = aiResponse.headers.get("cf-aig-cache-status") ?? "NONE";

        const logEntry = buildLogEntry(lastUserMsg?.content ?? "", dlp, cacheStatus, cacheOptions);

        // Log to D1 in the background -- zero latency impact on user
        ctx.waitUntil(logDLPEvent(env.DB, logEntry));

        // If gateway blocked the request, forward the error
        if (!aiResponse.ok) {
            return new Response(aiResponse.body, {
                status: aiResponse.status,
                headers: {
                    "content-type": "application/json",
                    "x-cache-status": cacheStatus,
                },
            });
        }

        // DLP passed or flagged -- stream response to client
        // Include cache status in response header so frontend can display it
        return new Response(aiResponse.body, {
            headers: {
                "content-type": "text/event-stream; charset=utf-8",
                "cache-control": "no-cache",
                "connection": "keep-alive",
                "x-cache-status": cacheStatus,
            },
        });
    } catch (error) {
        console.error("Error processing chat request:", error);
        return new Response(
            JSON.stringify({ error: "Failed to process request" }),
            { status: 500, headers: { "content-type": "application/json" } },
        );
    }
}
