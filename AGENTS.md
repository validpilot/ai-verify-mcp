# AI Agent Instructions

This document provides guidance for AI coding agents (Claude, Cursor, Trae, Copilot, etc.) working on the ai-verify-mcp project.

## Project Overview

**ai-verify-mcp** is an MCP (Model Context Protocol) server that provides 76 browser validation tools for AI agents. It enables AI agents to perform end-to-end web validation, debugging, and automated fixes through a standardized MCP interface.

**Core stack**: Node.js + Playwright + @modelcontextprotocol/sdk

## Architecture

```
server.js                    # Main MCP server (all tool handlers in switch statement)
tools/                       # 76 JSON schema files (one per tool)
engines/                     # Playwright / Chrome adapter engines
core/                        # Core utilities (artifacts, config, security, redaction, report)
hands/                       # High-level operators (browser_operator, evidence_collector, verification_runner)
brain/                       # AI logic (error_aggregator)
rules/                       # Validation rules (suggested-rules.json)
docs/                        # User documentation
examples/                    # Demo examples
bin/                         # CLI entry points
```

## Key Conventions

1. **Tool schema and implementation must match exactly** — Every tool in `tools/*.json` must have a corresponding handler in `server.js`'s switch statement. Parameters, types, and descriptions must be consistent.

2. **Security first** — Never expose API keys, tokens, passwords, or cookies in tool outputs. Use the redaction utilities in `core/redaction.js`. The `browser_eval` tool has known security risks and requires careful input validation.

3. **Sensitive data redaction** — All tool outputs that might contain sensitive data (cookies, storage, network responses with auth headers) must pass through redaction before being returned to the MCP client.

4. **Error handling** — Empty catch blocks are forbidden. Always log errors. HTTP servers must not be exposed to public networks without authentication.

5. **Session management** — Browser sessions must be fully closeable to prevent resource leaks. Pool operations must handle race conditions for thread safety.

6. **Log array boundary controls** — Log arrays must have size limits to prevent memory leaks.

7. **Schema naming** — Use `inputSchema` (camelCase), not `input_schema` (snake_case), to be consistent with the MCP SDK convention.

8. **CLI parameters** — Prefer environment variables over command-line arguments for sensitive configuration.

## Code Style

- Use `'use strict';` at the top of all JS files
- 2-space indentation
- Single quotes for strings
- No semicolons at end of lines? — No, use semicolons (see existing code)
- Prefer `const` over `let` over `var`
- Async/await for all asynchronous operations

## Adding a New Tool

1. Create `tools/<tool_name>.json` with full JSON schema (name, description, inputSchema)
2. Add the tool object to the `tools` array in `server.js`
3. Add a `case '<tool_name>':` block in the tool handler switch statement
4. Update the tool count in README.md and docs/USER-MANUAL.md
5. Add a test or verification script if applicable
6. Update CHANGELOG.md

## Testing

Run the following before submitting changes:

```bash
# Syntax check
node -c server.js

# Self-test (MCP protocol + browser tools)
node test-mcp.js

# Verify tool count matches schemas
node check-tools-final.js
```

## Release Process

1. Update version in `package.json` (follow SemVer)
2. Update `CHANGELOG.md` with changes
3. Run `npm pack --dry-run` to verify package contents
4. Run `npm publish` (requires 2FA/OTP)
5. Tag the release in git
