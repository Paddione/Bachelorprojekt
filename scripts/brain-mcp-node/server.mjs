#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Standard-library MCP stdio adapter for the shared Brain index.
 */

import { homedir } from "node:os";
import * as readline from "node:readline";
import { BrainIndex, parseDateTime } from "./index.mjs";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "brain-mcp";
const SERVER_VERSION = "1.1.0";

function ok(requestId, result) {
  return { jsonrpc: "2.0", id: requestId, result };
}

function fail(requestId, code, message) {
  return { jsonrpc: "2.0", id: requestId, error: { code, message } };
}

function writeMsg(message) {
  // Kein process.stdout.flush(): die Methode existiert in Node nicht und warf
  // bei jeder Antwort einen TypeError, der den Server nach dem ersten Frame
  // beendete. process.stdout.write reicht fuer stdio-Pipes aus.
  process.stdout.write(JSON.stringify(message) + "\n");
}

const TOOLS = [
  {
    name: "brain_search",
    description:
      "Search Brain pages with BM25 ranking and optional lifecycle filters.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query." },
        top_k: {
          type: "integer",
          minimum: 1,
          description: "Maximum results (default 5).",
        },
        type: { type: "string", description: "Exact page type filter." },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "All required tags.",
        },
        status: { type: "string", description: "Exact status filter." },
        source_kind: {
          type: "string",
          description: "Exact source kind filter.",
        },
        as_of: { type: "string", description: "ISO-8601 validity instant." },
      },
      required: ["query"],
    },
  },
  {
    name: "brain_read",
    description: "Read a complete Brain page by slug.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Filename without .md.",
        },
      },
      required: ["slug"],
    },
  },
];

class ArgumentError extends Error {
  constructor(message) {
    super(message);
    this.name = "ArgumentError";
  }
}

function searchArguments(arguments_) {
  if (typeof arguments_ !== "object" || arguments_ === null) {
    throw new ArgumentError("arguments must be an object");
  }
  const allowed = new Set([
    "query",
    "top_k",
    "type",
    "tags",
    "status",
    "source_kind",
    "as_of",
  ]);
  if (Object.keys(arguments_).some((k) => !allowed.has(k))) {
    throw new ArgumentError("unknown brain_search argument");
  }
  const query = arguments_.query;
  if (typeof query !== "string") {
    throw new ArgumentError("query must be a string");
  }
  let topK = arguments_.top_k ?? 5;
  if (typeof topK === "boolean" || typeof topK !== "number" || !Number.isInteger(topK) || topK < 1) {
    throw new ArgumentError("top_k must be a positive integer");
  }
  const tags = arguments_.tags;
  if (tags !== undefined && (!Array.isArray(tags) || !tags.every((t) => typeof t === "string"))) {
    throw new ArgumentError("tags must be a string array");
  }
  for (const key of ["type", "status", "source_kind", "as_of"]) {
    if (key in arguments_ && typeof arguments_[key] !== "string") {
      throw new ArgumentError(`${key} must be a string`);
    }
  }
  if (arguments_.as_of !== undefined) {
    try {
      parseDateTime(arguments_.as_of);
    } catch (exc) {
      throw new ArgumentError("as_of must be ISO-8601", { cause: exc });
    }
  }
  return {
    query,
    top_k: topK,
    page_type: arguments_.type,
    tags,
    status: arguments_.status,
    source_kind: arguments_.source_kind,
    as_of: arguments_.as_of,
  };
}

function handleTool(requestId, params, index, wikiDir) {
  if (typeof params !== "object" || params === null) {
    return fail(requestId, -32602, "Invalid params");
  }
  const name = params.name;
  const arguments_ = params.arguments ?? {};
  if (name === "brain_search") {
    try {
      const parsed = searchArguments(arguments_);
      const results = index.search(parsed);
      const content = JSON.stringify({ results }, false);
      return ok(requestId, {
        content: [{ type: "text", text: content }],
      });
    } catch (exc) {
      if (exc instanceof ArgumentError) {
        return fail(requestId, -32602, exc.message);
      }
      throw exc;
    }
  }
  if (name === "brain_read") {
    if (
      typeof arguments_ !== "object" ||
      arguments_ === null ||
      typeof arguments_.slug !== "string"
    ) {
      return fail(requestId, -32602, "slug must be a string");
    }
    const page = index.readPage(arguments_.slug);
    if (page === null) {
      return fail(
        requestId,
        -32000,
        `Page not found: '${arguments_.slug}' (searched in ${wikiDir})`
      );
    }
    return ok(requestId, {
      content: [
        {
          type: "text",
          text: JSON.stringify(page, false),
        },
      ],
    });
  }
  return fail(requestId, -32601, `Tool not found: ${name}`);
}

function main() {
  const defaultWiki = `${homedir()}/brain/wiki`;
  const wikiDir = process.env.BRAIN_WIKI_DIR || defaultWiki;
  const index = new BrainIndex(wikiDir);

  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      writeMsg(fail(null, -32700, "Parse error"));
      return;
    }
    const requestId = message.id;
    const method = message.method ?? "";
    try {
      if (method === "initialize") {
        writeMsg(
          ok(requestId, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          })
        );
      } else if (
        method === "notifications/initialized" ||
        method === "notifications/cancelled"
      ) {
        return;
      } else if (method === "ping") {
        writeMsg(ok(requestId, {}));
      } else if (method === "tools/list") {
        writeMsg(ok(requestId, { tools: TOOLS }));
      } else if (method === "tools/call") {
        writeMsg(
          handleTool(
            requestId,
            message.params ?? {},
            index,
            wikiDir
          )
        );
      } else {
        writeMsg(fail(requestId, -32601, `Method not found: ${method}`));
      }
    } catch (exc) {
      writeMsg(fail(requestId, -32603, `Internal error: ${exc}`));
    }
  });
}

main();
