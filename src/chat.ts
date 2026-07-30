import { ChatMessage, Env } from "./types";
import { parseDLPHeader, buildLogEntry, logDLPEvent } from "./dlp-logger";

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";
const SYSTEM_PROMPT = "You are a helpful, friendly assistant. Provide concise and accurate responses.";

export async function handleChatRequest(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
): Promise<Response> {
    try {
        const { messages = [] } = await request.json() as { messages: ChatMessage[] };

        if (!messages.some((msg) => msg.role === "system")) {
            messages.unshift({ role: "system", content: SYSTEM_PROMPT });
        }

        const lastUserMsg = messages.filter(m => m.role === "user").pop();

        // Use fetch() instead of env.AI.run() to get cf-aig-dlp response header
        const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${env.ACCOUNT_ID}/${env.GATEWAY_ID}/workers-ai/${MODEL_ID}`;

        const aiResponse = await fetch(gatewayUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${env.CF_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ messages, max_tokens: 1024, stream: true }),
        });

        // Parse DLP verdict from gateway response header
        const rawDlpHeader = aiResponse.headers.get("cf-aig-dlp");
        const dlp = parseDLPHeader(rawDlpHeader);
        const logEntry = buildLogEntry(lastUserMsg?.content ?? "", dlp);

        // Log to D1 in the background -- zero latency impact on user
        ctx.waitUntil(logDLPEvent(env.DB, logEntry, rawDlpHeader));

        // If gateway blocked the request, forward the error
        if (!aiResponse.ok) {
            return new Response(aiResponse.body, {
                status: aiResponse.status,
                headers: { "content-type": "application/json" },
            });
        }

        // DLP passed or flagged -- stream response to client
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
