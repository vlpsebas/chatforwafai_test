import { ChatMessage, Env } from "./types";
import { parseDLPHeader, buildLogEntry, logDLPEvent } from "./dlp-logger";

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";
const SYSTEM_PROMPT = "You are a helpful, friendly assistant. Provide concise and accurate responses.";

// Default cache TTL in seconds (5 minutes)
const DEFAULT_CACHE_TTL = 300;

export async function handleChatRequest(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
): Promise<Response> {
    try {
        const { messages = [] } = await request.json() as {
            messages: ChatMessage[];
        };

        if (!messages.some((msg) => msg.role === "system")) {
            messages.unshift({ role: "system", content: SYSTEM_PROMPT });
        }

        const lastUserMsg = messages.filter(m => m.role === "user").pop();
        const userText = lastUserMsg?.content ?? "";

        // Read widget ID from request header (production) or forwarded from frontend
        const widgetId = request.headers.get("x-widget-id") ?? null;

        // Use fetch() instead of env.AI.run() to get response headers
        const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${env.ACCOUNT_ID}/${env.GATEWAY_ID}/workers-ai/${MODEL_ID}`;

        // Build gateway request headers with server-side cache controls
        const gatewayHeaders: Record<string, string> = {
            "Authorization": `Bearer ${env.CF_API_TOKEN}`,
            "Content-Type": "application/json",
        };

        // --- Server-side cache strategy ---
        // Cache key combines widget ID (if present) + message hash
        // Same question = same cache, regardless of chat history
        // Widget scopes the cache so different widgets don't share responses
        const msgHash = simpleHash(userText);
        const cacheKey = widgetId
            ? `widget-${widgetId}-${msgHash}`
            : `chat-${msgHash}`;

        gatewayHeaders["cf-aig-cache-key"] = cacheKey;
        gatewayHeaders["cf-aig-cache-ttl"] = String(DEFAULT_CACHE_TTL);

        const aiResponse = await fetch(gatewayUrl, {
            method: "POST",
            headers: gatewayHeaders,
            body: JSON.stringify({ messages, max_tokens: 1024, stream: true }),
        });

        // Parse DLP verdict from gateway response header
        const dlp = parseDLPHeader(aiResponse.headers.get("cf-aig-dlp"));

        // Capture cache status from gateway response
        const cacheStatus = aiResponse.headers.get("cf-aig-cache-status") ?? "NONE";

        // Only log to D1 when DLP detects something (FLAG or BLOCK)
        // Clean requests don't create audit entries
        if (dlp) {
            const logEntry = buildLogEntry(userText, dlp, cacheStatus, cacheKey, widgetId);
            ctx.waitUntil(logDLPEvent(env.DB, logEntry));
        }

        // If gateway blocked the request, forward the error
        if (!aiResponse.ok) {
            return new Response(aiResponse.body, {
                status: aiResponse.status,
                headers: { "content-type": "application/json" },
            });
        }

        // Stream response to client
        // Cache status is NOT exposed to the client (security: prevents cache probing)
        // Visible only in AI Gateway dashboard and D1 audit logs
        return new Response(aiResponse.body, {
            headers: {
                "content-type": "text/event-stream; charset=utf-8",
                "cache-control": "no-cache",
                "connection": "keep-alive",
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

/**
 * Simple hash of a string for use as a cache key.
 * Same question = same hash = cache hit, regardless of chat history.
 */
function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}
