 /**
 * DLP Audit Logger
 * 
 * Logs AI Gateway DLP verdicts to D1 for compliance and audit.
 * 
 * FUTURE: 
 * - Admin chat UI to query these logs via natural language
 * - MCP tool exposure for agent-based log access
 * - D1 query functions for filtered searches (by action, category, date range)
 */

export interface DLPFinding {
    profile: {
        context: Record<string, unknown>;
        entry_ids: string[];
        profile_id: string;
    };
    policy_ids: string[];
    check: "REQUEST" | "RESPONSE";
}

export interface DLPResult {
    findings: DLPFinding[];
    action: "BLOCK" | "FLAG";
}

export interface DLPLogEntry {
    userMessage: string;
    dlpAction: string;
    dlpFindings: string | null;
    dlpCheck: string | null;
    blocked: boolean;
    timestamp: number;
}

/**
 * Parse the cf-aig-dlp response header from AI Gateway
 */
export function parseDLPHeader(header: string | null): DLPResult | null {
    if (!header) return null;
    try {
        return JSON.parse(header) as DLPResult;
    } catch {
        return null;
    }
}

/**
 * Build a log entry from a DLP result
 */
export function buildLogEntry(userMessage: string, dlp: DLPResult | null): DLPLogEntry {
    return {
        userMessage,
        dlpAction: dlp?.action ?? "PASS",
        dlpFindings: dlp ? JSON.stringify(dlp.findings) : null,
        dlpCheck: dlp?.findings?.[0]?.check ?? null,
        blocked: dlp?.action === "BLOCK",
        timestamp: Date.now(),
    };
}

/**
 * Write a DLP log entry to D1
 * Call this inside ctx.waitUntil() so it doesn't block the response
 */
export async function logDLPEvent(db: D1Database, entry: DLPLogEntry, rawHeader: string | null): Promise<void> {
    await db.prepare(
        `INSERT INTO chat_dlp_logs 
         (user_message, dlp_action, dlp_findings, dlp_check, blocked, timestamp, raw_dlp_header) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        entry.userMessage,
        entry.dlpAction,
        entry.dlpFindings,
        entry.dlpCheck,
        entry.blocked ? 1 : 0,
        entry.timestamp,
        rawHeader,
    ).run();
}

// ============================================================
// FUTURE: Admin query functions for the MCP agent chat UI
// ============================================================
// export async function queryLogs(db: D1Database, filters: {...}): Promise<DLPLogEntry[]> { }
// export async function getBlockedCount(db: D1Database, since: number): Promise<number> { }
// export async function getLogsByCategory(db: D1Database, profileId: string): Promise<DLPLogEntry[]> { }
