/**
 * DLP Audit Logger
 * 
 * Logs AI Gateway DLP verdicts to D1 for compliance and audit.
 * Translates opaque profile/entry UUIDs into human-readable names.
 * 
 * FUTURE: 
 * - Admin chat UI to query these logs via natural language
 * - MCP tool exposure for agent-based log access
 * - D1 query functions for filtered searches (by action, category, date range)
 */

// ============================================================
// Human-readable name maps (from Cloudflare DLP Profiles API)
// ============================================================
const PROFILE_NAMES: Record<string, string> = {
    "a0cabf16-7491-4c9a-ac02-f64cabc66394": "AI Prompt: AI Security",
    "0ec8551b-e278-45a0-89da-652d1d7dd3e6": "AI Prompt: Customer",
    "bdf84737-5046-46c7-8dff-eb792901c278": "AI Prompt: Financial Information",
    "8c426a20-34fb-4fdc-afa0-20b0590750dc": "AI Prompt: PII",
    "90a1626d-556f-416f-966e-6221219f262d": "AI Prompt: Technical",
    "c042fb9d-bb3c-40d1-b1ee-94ea5a3d6033": "Block phone nbs",
    "c8932cc4-3312-4152-8041-f3f257122dc4": "Credentials and Secrets",
    "e91a2360-da51-4fdf-9711-bcdecd462614": "Financial Information",
    "583a2366-b16e-4f5c-90db-494710f4f71c": "Health Information",
    "9111845c-6a77-4c6e-af7e-0d51960b48a4": "Personally Identifiable Information (PII) Record",
    "d658f520-6ecb-4a34-a725-ba37243c2d28": "Social Security, Insurance, Tax, and Identifier Numbers",
    "0e1a3432-c838-4b28-b13e-2958047fad7c": "Source Code",
    "dcda46d3-5b3c-4a5b-b405-f8d6634503d8": "Unsanitized HAR",
};

const ENTRY_NAMES: Record<string, string> = {
    // AI Prompt: AI Security
    "cbbf9e4e-cc95-46c4-80d8-fb2c61176c9c": "AI Prompt Intent: Code Abuse and Malicious Code",
    "ab54fe6d-2968-4b2a-9a9f-c47ffb1ba5f1": "AI Prompt Intent: Jailbreak",
    // AI Prompt: Customer
    "5bce03be-0b03-434c-9f56-7b42512e0ff6": "AI Prompt Content: Customer data",
    // AI Prompt: Financial Information
    "57713850-712a-4bf5-9c04-60b85322dab7": "AI Prompt Content: Financial Information",
    // AI Prompt: PII
    "0036be9e-5e9b-4bb8-a307-bdc794966b20": "AI Prompt Content: PII",
    "6ac56d9e-4cf6-42c7-a0f7-0cf15237dc48": "AI Prompt Intent: PII",
    // AI Prompt: Technical
    "906fcb91-2eb5-4534-8f86-f95214b651eb": "AI Prompt Content: Credentials and Secrets",
    "e67c5064-7558-4c7e-9049-c292bffbe962": "AI Prompt Content: Source code",
    // Block phone nbs (custom)
    "9d0862e0-61f8-4ef4-9189-7ccd8767c6a4": "PT phone nbs",
    // Credentials and Secrets
    "d8fcfc9c-773c-405e-8426-21ecbb67ba93": "Amazon AWS Access Key ID",
    "2c0e33e1-71da-40c8-aad3-32e674ad3d96": "Amazon AWS Secret Access Key",
    "362a71ef-9812-4ad2-b798-e15b4d4e7020": "Cloudflare Account Owned API Token",
    "a1bebf3d-f3d5-4203-9521-ad619fcab5e8": "Cloudflare User API Key",
    "d2f407b4-7ddd-4eba-8280-0c9e5335fdff": "Cloudflare User API Token",
    "6c6579e4-d832-42d5-905c-8e53340930f2": "Google GCP API Key",
    "4e92c006-3802-4dff-bbe1-8e1513b1c92a": "Microsoft Azure Client Secret",
    "5c713294-2375-4904-abcf-e4a15be4d592": "SSH Private Key",
    // Financial Information
    "56a8c060-01bb-4f89-ba1e-3ad42770a342": "American Express Card Number",
    "7f575e6d-039a-465e-85cf-175bda88d4f2": "American Express Text",
    "2d9c356d-b5a3-482a-b01e-0363e0de7458": "CVV Card Number (labeled)",
    "03ebabfd-ce7e-45ed-8061-65e28f0a6e53": "Diners Club Card Number",
    "2f3657af-c39b-4899-9a98-22f7d187dd28": "IBAN",
    "753a16f9-f533-4208-a5b8-6319b201e9fb": "Mastercard Card Number",
    "ebcea2c4-335a-457c-853b-f7ae7cc74e07": "Mastercard Text",
    "3f5c4c83-f34c-4d17-81c7-3028385737b3": "SWIFT",
    "d1a84fde-c375-4d3c-8a27-8c4eaa33cf60": "Union Pay Card Number",
    "6dbe5604-d3a3-4c3e-905c-57985704bea7": "Union Pay Text",
    "55ba2c6c-8ef4-4b2e-9148-e75e8b6ccac1": "United States ABA Routing Number",
    "5b1d5035-8c53-4bc9-a151-404eb32b34b4": "Visa Card Number",
    "acf28d88-2daf-4bc4-aa36-5ac1fac0540a": "Visa Text",
    // Health Information
    "9237e83f-fde6-4ff5-84de-0493d7c354d6": "FDA Active Ingredients",
    "01a36c71-ddf2-4b4e-90a3-9c2d87341658": "FDA Drug Names",
    "5a38ac66-a939-4f66-ae12-50d67e7dcc92": "ICD-10 FY2023 Short Description",
    "4359bfc2-7e81-4611-bdae-204d0d978f1a": "ICD-11 Short Description",
    // PII Record
    "fc34aa87-925a-4969-8cc3-c1972a0b2d03": "Australia Passport Number",
    "e7c2d4a8-9b3f-4e6d-8a5c-3f2e1d0c9b8a": "Email Address",
    "4e1bee7d-2c07-4323-beab-b40733745607": "Full Name",
    "aa933e5e-8f87-4f55-be5e-f70dd2863826": "US Driver's License Number",
    "f557727e-5506-4371-a8d2-de7909ee5ee4": "US Individual Tax Identification Number (ITIN)",
    "996eceab-382d-49bc-a291-b4eaf96a97c3": "US Mailing Address",
    "161ed1ab-f8ce-46fa-8ae5-6fa6dadcc837": "US Passport Number",
    "37a70af2-353c-4833-ba48-e121df3cce19": "US Phone Number",
    // Social Security, Insurance, Tax
    "01dff9ae-20e8-4b51-bb38-981c6e175530": "Australia Tax File Number",
    "350cfd3d-b076-41be-af79-227043fc7b8b": "Canada Social Insurance Number",
    "c1da1616-7443-428c-a60e-050e36c3e1dd": "France Social Security Number",
    "50d0e227-2279-4a0e-af44-314070716c36": "Hong Kong Identity Card Number",
    "71a54796-ff76-41fb-977e-632e89bee3b1": "Indonesia Identity Card Number",
    "d57d8593-ab1e-4af1-8fb9-5fd7afe334b4": "Malaysian National Identity Card Number",
    "d777d198-b1fa-4964-b1ff-99274d4626df": "Philippines Unified Multi-Purpose ID",
    "6caf79f0-086c-4a7c-b708-0d903c13c1a8": "Singapore National Registration Identity Card Number",
    "ddc44eca-6e26-4d54-b799-8ed90aec851e": "Taiwan National Identification Number",
    "500c27d5-db83-415c-a4a0-3f591153e7f1": "Thai Identity Card Number",
    "c81bae8a-9426-4ecc-91c0-cd3144f40c1f": "United Kingdom NHS Number",
    "761adbab-d6de-4127-998a-12dc9be6fe6f": "United Kingdom National Insurance Number",
    "111b9d4b-a5c6-40f0-957d-9d53b25dd84a": "United States SSN",
    "aec08712-ee49-4109-9d9f-3b229c5b3dcd": "United States SSN Text",
    // Source Code
    "c23afc26-96f1-443b-8278-c96aa3200983": "C",
    "ebc203b6-01bf-49c3-96de-1407c34bf220": "C#",
    "4be29f9a-478c-4e13-b2bc-e23881ca339b": "C++",
    "2a868cb4-9f04-4b8c-b00e-a774a8fbf227": "Go",
    "de0115f3-b449-4123-8aff-712e78c8446a": "Haskell",
    "9fc25535-fcf8-4aa1-83b1-c814ee982b5b": "Java",
    "8a61bb3f-f29d-4881-9802-94034b19c471": "JavaScript",
    "3a7fdbfd-05d4-462b-a375-d191b10c8db5": "Lua",
    "7a3eae49-a13f-4053-a59d-7525278ed193": "Python",
    "124398db-41cc-4a6a-a980-83b699f45187": "R",
    "fd773453-c868-47e2-96f8-5f947c1a2c9d": "Rust",
    "77824044-8591-4845-99e3-687db70ab836": "Swift",
    // Unsanitized HAR
    "8ea7407d-6083-40e4-84c0-2088f00aa03d": "Unsanitized HAR File",
};

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
    dlpHeader: string | null;
    blocked: boolean;
    timestamp: number;
    // Cache fields
    cacheStatus: string;
    cacheTtl: number | null;
    cacheKey: string | null;
    skipCache: boolean;
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
 * Build a human-readable DLP header string
 * e.g. "FLAG: Visa Card Number detected in REQUEST (profile: Financial Information, policy: Policy 1)"
 */
function buildDLPHeaderText(dlp: DLPResult): string {
    const parts = dlp.findings.map((finding) => {
        const profileName = PROFILE_NAMES[finding.profile.profile_id] ?? finding.profile.profile_id;
        const entryNames = finding.profile.entry_ids
            .map((id) => ENTRY_NAMES[id] ?? id)
            .join(", ");
        const policies = finding.policy_ids.join(", ");
        return `${entryNames} detected in ${finding.check} (profile: ${profileName}, policy: ${policies})`;
    });
    return `${dlp.action}: ${parts.join(" | ")}`;
}

/**
 * Build a log entry from a DLP result + cache status
 */
export function buildLogEntry(
    userMessage: string,
    dlp: DLPResult | null,
    cacheStatus: string,
    cacheOptions?: { cacheTtl?: number; skipCache?: boolean; cacheKey?: string },
): DLPLogEntry {
    return {
        userMessage,
        dlpAction: dlp?.action ?? "PASS",
        dlpFindings: dlp ? JSON.stringify(dlp.findings) : null,
        dlpCheck: dlp?.findings?.[0]?.check ?? null,
        dlpHeader: dlp ? buildDLPHeaderText(dlp) : "No DLP findings",
        blocked: dlp?.action === "BLOCK",
        timestamp: Date.now(),
        cacheStatus,
        cacheTtl: cacheOptions?.cacheTtl ?? null,
        cacheKey: cacheOptions?.cacheKey ?? null,
        skipCache: cacheOptions?.skipCache ?? false,
    };
}

/**
 * Write a DLP log entry to D1
 * Call this inside ctx.waitUntil() so it doesn't block the response
 */
export async function logDLPEvent(db: D1Database, entry: DLPLogEntry): Promise<void> {
    await db.prepare(
        `INSERT INTO chat_dlp_logs 
         (user_message, dlp_action, dlp_findings, dlp_check, blocked, timestamp, dlp_header, cache_status, cache_ttl, cache_key, skip_cache) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        entry.userMessage,
        entry.dlpAction,
        entry.dlpFindings,
        entry.dlpCheck,
        entry.blocked ? 1 : 0,
        entry.timestamp,
        entry.dlpHeader,
        entry.cacheStatus,
        entry.cacheTtl,
        entry.cacheKey,
        entry.skipCache ? 1 : 0,
    ).run();
}

// ============================================================
// FUTURE: Admin query functions for the MCP agent chat UI
// ============================================================
// export async function queryLogs(db: D1Database, filters: {...}): Promise<DLPLogEntry[]> { }
// export async function getBlockedCount(db: D1Database, since: number): Promise<number> { }
// export async function getLogsByCategory(db: D1Database, profileId: string): Promise<DLPLogEntry[]> { }
