/**
 * LLM Chat App Frontend
 *
 * Handles the chat UI interactions and communication with the backend API.
 */

// DOM elements
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

// Cache control elements (added dynamically)
let cacheControls = null;
function initCacheControls() {
	const inputArea = document.querySelector(".message-input");
	if (!inputArea || cacheControls) return;

	cacheControls = document.createElement("div");
	cacheControls.id = "cache-controls";
	cacheControls.innerHTML = `
		<div style="display:flex; gap:12px; padding:8px 16px; background:#f3f4f6; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280; align-items:center; flex-wrap:wrap;">
			<label style="display:flex;align-items:center;gap:4px;">
				<input type="checkbox" id="skip-cache"> Skip Cache
			</label>
			<label style="display:flex;align-items:center;gap:4px;">
				TTL: <input type="number" id="cache-ttl" placeholder="seconds" min="60" max="2592000" style="width:80px;background:#fff;color:#1f2937;border:1px solid #d1d5db;border-radius:4px;padding:2px 6px;font-size:12px;">
			</label>
			<label style="display:flex;align-items:center;gap:4px;">
				Cache Key: <input type="text" id="cache-key" placeholder="e.g. campaign-123" style="width:130px;background:#fff;color:#1f2937;border:1px solid #d1d5db;border-radius:4px;padding:2px 6px;font-size:12px;">
			</label>
			<span id="cache-status-badge" style="margin-left:auto;padding:2px 8px;border-radius:4px;font-weight:bold;display:none;"></span>
		</div>
	`;
	inputArea.parentNode.insertBefore(cacheControls, inputArea);
}

function getCacheOptions() {
	const skipCache = document.getElementById("skip-cache")?.checked ?? false;
	const ttlInput = document.getElementById("cache-ttl")?.value;
	const cacheKey = document.getElementById("cache-key")?.value?.trim();
	const options = {};
	if (skipCache) options.skipCache = true;
	if (ttlInput && Number(ttlInput) >= 60) options.cacheTtl = Number(ttlInput);
	if (cacheKey) options.cacheKey = cacheKey;
	return options;
}

function showCacheStatus(status) {
	const badge = document.getElementById("cache-status-badge");
	if (!badge) return;
	badge.style.display = "inline-block";
	badge.textContent = `Cache: ${status}`;
	if (status === "HIT") {
		badge.style.background = "#22c55e";
		badge.style.color = "#000";
	} else if (status === "MISS") {
		badge.style.background = "#ef4444";
		badge.style.color = "#fff";
	} else {
		badge.style.background = "#666";
		badge.style.color = "#fff";
	}
}

// Initialize cache controls on load
document.addEventListener("DOMContentLoaded", initCacheControls);
// Also try immediately in case DOM is already ready
initCacheControls();

// Chat state
let chatHistory = [
	{
		role: "assistant",
		content:
			"Hello! I'm an LLM chat app powered by Cloudflare Workers AI. How can I help you today?",
	},
];
let isProcessing = false;

// Auto-resize textarea as user types
userInput.addEventListener("input", function () {
	this.style.height = "auto";
	this.style.height = this.scrollHeight + "px";
});

// Send message on Enter (without Shift)
userInput.addEventListener("keydown", function (e) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
});

// Send button click handler
sendButton.addEventListener("click", sendMessage);

/**
 * Sends a message to the chat API and processes the response
 */
async function sendMessage() {
	const message = userInput.value.trim();

	// Don't send empty messages
	if (message === "" || isProcessing) return;

	// Disable input while processing
	isProcessing = true;
	userInput.disabled = true;
	sendButton.disabled = true;

	// Add user message to chat
	addMessageToChat("user", message);

	// Clear input
	userInput.value = "";
	userInput.style.height = "auto";

	// Show typing indicator
	typingIndicator.classList.add("visible");

	// Add message to history
	chatHistory.push({ role: "user", content: message });

	try {
		// Create new assistant response element
		const assistantMessageEl = document.createElement("div");
		assistantMessageEl.className = "message assistant-message";
		assistantMessageEl.innerHTML = "<p></p>";
		chatMessages.appendChild(assistantMessageEl);
		const assistantTextEl = assistantMessageEl.querySelector("p");

		// Scroll to bottom
		chatMessages.scrollTop = chatMessages.scrollHeight;

		// Send request to API with cache options
		const cacheOptions = getCacheOptions();
		const response = await fetch("/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				messages: chatHistory,
				cacheOptions,
			}),
		});

		// Show cache status from response header
		const cacheStatus = response.headers.get("x-cache-status") || "NONE";
		showCacheStatus(cacheStatus);

		// Handle errors
		if (!response.ok) {
			throw new Error("Failed to get response");
		}
		if (!response.body) {
			throw new Error("Response body is null");
		}

		// Process streaming response
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let responseText = "";
		let buffer = "";
		const flushAssistantText = () => {
			assistantTextEl.textContent = responseText;
			chatMessages.scrollTop = chatMessages.scrollHeight;
		};

		let sawDone = false;
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				// Process any remaining complete events in buffer
				const parsed = consumeSseEvents(buffer + "\n\n");
				for (const data of parsed.events) {
					if (data === "[DONE]") {
						break;
					}
					try {
						const jsonData = JSON.parse(data);
						// Handle both Workers AI format (response) and OpenAI format (choices[0].delta.content)
						let content = "";
						if (
							typeof jsonData.response === "string" &&
							jsonData.response.length > 0
						) {
							content = jsonData.response;
						} else if (jsonData.choices?.[0]?.delta?.content) {
							content = jsonData.choices[0].delta.content;
						}
						if (content) {
							responseText += content;
							flushAssistantText();
						}
					} catch (e) {
						console.error("Error parsing SSE data as JSON:", e, data);
					}
				}
				break;
			}

			// Decode chunk
			buffer += decoder.decode(value, { stream: true });
			const parsed = consumeSseEvents(buffer);
			buffer = parsed.buffer;
			for (const data of parsed.events) {
				if (data === "[DONE]") {
					sawDone = true;
					buffer = "";
					break;
				}
				try {
					const jsonData = JSON.parse(data);
					// Handle both Workers AI format (response) and OpenAI format (choices[0].delta.content)
					let content = "";
					if (
						typeof jsonData.response === "string" &&
						jsonData.response.length > 0
					) {
						content = jsonData.response;
					} else if (jsonData.choices?.[0]?.delta?.content) {
						content = jsonData.choices[0].delta.content;
					}
					if (content) {
						responseText += content;
						flushAssistantText();
					}
				} catch (e) {
					console.error("Error parsing SSE data as JSON:", e, data);
				}
			}
			if (sawDone) {
				break;
			}
		}

		// Add completed response to chat history
		if (responseText.length > 0) {
			chatHistory.push({ role: "assistant", content: responseText });
		}
	} catch (error) {
		console.error("Error:", error);
		addMessageToChat(
			"assistant",
			"Sorry, there was an error processing your request.",
		);
	} finally {
		// Hide typing indicator
		typingIndicator.classList.remove("visible");

		// Re-enable input
		isProcessing = false;
		userInput.disabled = false;
		sendButton.disabled = false;
		userInput.focus();
	}
}

/**
 * Helper function to add message to chat
 */
function addMessageToChat(role, content) {
	const messageEl = document.createElement("div");
	messageEl.className = `message ${role}-message`;
	messageEl.innerHTML = `<p>${content}</p>`;
	chatMessages.appendChild(messageEl);

	// Scroll to bottom
	chatMessages.scrollTop = chatMessages.scrollHeight;
}

function consumeSseEvents(buffer) {
	let normalized = buffer.replace(/\r/g, "");
	const events = [];
	let eventEndIndex;
	while ((eventEndIndex = normalized.indexOf("\n\n")) !== -1) {
		const rawEvent = normalized.slice(0, eventEndIndex);
		normalized = normalized.slice(eventEndIndex + 2);

		const lines = rawEvent.split("\n");
		const dataLines = [];
		for (const line of lines) {
			if (line.startsWith("data:")) {
				dataLines.push(line.slice("data:".length).trimStart());
			}
		}
		if (dataLines.length === 0) continue;
		events.push(dataLines.join("\n"));
	}
	return { events, buffer: normalized };
}
