// The Model Context Protocol, as ZAVQERA speaks it to ChatGPT, Claude and
// Gemini: JSON-RPC 2.0 over Streamable HTTP, stateless. Every POST carries
// one message (or, from older clients, a batch) and gets its answer in the
// same response as application/json. There is no session and no server-sent
// stream, which suits a serverless host and is allowed by the transport.
//
// Pure: it knows nothing about HTTP, tokens or the database. The route hands
// it a parsed body and a way to call tools; tests drive it the same way.

/** Newest first. The server answers in the version the client asked for when it knows it. */
export const PROTOCOL_VERSIONS = Object.freeze(["2025-11-25", "2025-06-18", "2025-03-26"]);
export const LATEST_PROTOCOL_VERSION = PROTOCOL_VERSIONS[0];

export const SERVER_INFO = Object.freeze({
  name: "zavqera",
  title: "ZAVQERA",
  version: "1.0.0",
  websiteUrl: "https://zavqera.com",
  icons: [{ src: "https://zavqera.com/icon.svg", mimeType: "image/svg+xml", sizes: ["any"] }],
});

/**
 * Shown to the assistant once, at connection. It describes what the server
 * holds and how its tools fit together; it does not tell the assistant how to
 * behave beyond that, as both directories require.
 */
export const SERVER_INSTRUCTIONS = [
  "ZAVQERA stores the person's Missions: a goal with an intent, optional success criteria, ordered steps, proof recorded on finished steps, and optional dates.",
  "Use create_mission to save a plan made in the conversation, get_next_steps or list_missions to see where things stand, get_mission for one Mission's steps and their step_id values, and complete_step to record a finished step with its proof.",
  "Step and Mission ids come from these tools' results.",
].join(" ");

export const JSON_RPC_ERRORS = Object.freeze({
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
});

export function negotiateProtocolVersion(requested) {
  return PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION;
}

function failure(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function success(id, result) {
  return { jsonrpc: "2.0", id, result };
}

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isId = (value) => typeof value === "string" || (typeof value === "number" && Number.isFinite(value));

/**
 * One JSON-RPC message in, its response out, or null when nothing is owed:
 * notifications and responses get no answer.
 *
 * `context.listTools()` returns the tool descriptors; `context.callTool(name,
 * args)` runs one and returns an MCP CallToolResult, or null when there is no
 * tool by that name.
 */
export async function handleMcpMessage(message, context) {
  if (!isObject(message) || message.jsonrpc !== "2.0") {
    return failure(isObject(message) && isId(message.id) ? message.id : null, JSON_RPC_ERRORS.INVALID_REQUEST, "Expected a JSON-RPC 2.0 message.");
  }
  // A response from the client (to a request this server never sends) or a
  // notification such as notifications/initialized: nothing to answer.
  if (typeof message.method !== "string") return null;
  if (!("id" in message) || message.id === undefined) return null;
  if (!isId(message.id)) return failure(null, JSON_RPC_ERRORS.INVALID_REQUEST, "The request id must be a string or a number.");

  const { id, method } = message;
  const params = isObject(message.params) ? message.params : {};

  switch (method) {
    case "initialize":
      return success(id, {
        protocolVersion: negotiateProtocolVersion(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      });
    case "ping":
      return success(id, {});
    case "tools/list":
      return success(id, { tools: context.listTools() });
    case "tools/call": {
      if (typeof params.name !== "string" || !params.name) {
        return failure(id, JSON_RPC_ERRORS.INVALID_PARAMS, "tools/call needs the tool's name.");
      }
      const args = params.arguments === undefined ? {} : params.arguments;
      if (!isObject(args)) return failure(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Tool arguments must be an object.");
      try {
        const result = await context.callTool(params.name, args);
        if (result === null) return failure(id, JSON_RPC_ERRORS.INVALID_PARAMS, `There is no tool named ${params.name}.`);
        return success(id, result);
      } catch {
        return failure(id, JSON_RPC_ERRORS.INTERNAL, "ZAVQERA could not run this tool just now. Try again in a moment.");
      }
    }
    // Not offered in the capabilities, but answered with empty lists rather
    // than an error, for clients that ask anyway.
    case "resources/list":
      return success(id, { resources: [] });
    case "resources/templates/list":
      return success(id, { resourceTemplates: [] });
    case "prompts/list":
      return success(id, { prompts: [] });
    default:
      return failure(id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method not supported: ${method}`);
  }
}

/**
 * A whole request body: one message or a batch. Returns the JSON to send, or
 * null when the body held only notifications (answered with 202 Accepted).
 */
export async function handleMcpPayload(payload, context) {
  if (Array.isArray(payload)) {
    if (!payload.length) return failure(null, JSON_RPC_ERRORS.INVALID_REQUEST, "An empty batch is not a request.");
    const answers = [];
    for (const message of payload) {
      const answer = await handleMcpMessage(message, context);
      if (answer) answers.push(answer);
    }
    return answers.length ? answers : null;
  }
  return handleMcpMessage(payload, context);
}

export function parseErrorResponse() {
  return failure(null, JSON_RPC_ERRORS.PARSE, "The request body is not valid JSON.");
}
