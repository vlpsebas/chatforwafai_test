/**
 * Type definitions for the LLM chat application.
 */

export interface Env {
	/**
	 * Binding for the Workers AI API.
	 */
	AI: Ai;

	/**
	 * Binding for static assets.
	 */
    ASSETS: Fetcher;
    DB: D1Database;           // D1 for DLP audit logs
    ACCOUNT_ID: string;       // wrangler secret
    GATEWAY_ID: string;       // wrangler secret
    CF_API_TOKEN: string;     // wrangler secret
}

/**
 * Represents a chat message.
 */
export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}



