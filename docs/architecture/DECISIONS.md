# Architecture and research

## Scope
ONE is a working name. Brand alternatives: Connexa Relay, Portivo, Linkstead (not trademark-cleared). A name search found [One MCP](https://mcp.so/servers/one), [MarcoPolo One MCP](https://www.marcopolo.dev/one-mcp), and [Cloudflare One](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/). Keep `one-mcp` provisional; no claim of name availability.

## Competitive evidence (2026-10-19)
- [R0Wi gateway](https://github.com/r0wi/mcp-gateway): self-hosted aggregation. Aggregation alone is not original.
- [MSPStack](https://github.com/mspstack/mcp-gateway): namespaces, per-tool controls, OAuth, roles, server-side secrets, revocation and per-user upstream sessions already exist. These cannot be claimed as innovations.
- [IBM ContextForge](https://github.com/IBM/mcp-context-forge): registry, discovery, proxy, guardrails; Apache-2.0.
- [Nango license](https://github.com/NangoHQ/nango/blob/master/LICENSE): ELv2, restrictions on hosted managed services. Do not incorporate as an Apache-compatible core dependency. Use a replaceable in-house OAuth adapter based on standard HTTPS APIs; no invented cryptography.

Differentiation hypothesis, not proven market uniqueness: personal multi-account connection identity independent of downstream clients, affordable permission-filtered discovery and durable approvals in one approachable self-hosted product. Validate adoption and discovery quality before making novelty claims.

## System
A modular monolith (Fastify API + MCP at `/mcp`) and Next.js dashboard, PostgreSQL persisted state. Drizzle schema with versioned SQL migration. Same-origin reverse proxy for browser API. No Redis or LLM dependency. Stateless Streamable HTTP via official MCP SDK: stable `one_search_tools`, `one_call_tool`, `one_approval_status`; no assumption of client tool-list notifications. Every request reauthenticates; no authorization carried solely by a transport session.

Browser sessions and MCP clients have separate credential stores and expiry. Upstream connections are user-owned, never client-owned. Removing one client leaves provider credentials intact. Scope gates exist both in discovery and execution. Approval execution consumes immutable server-side arguments and rechecks grant/connection/client status.

## Protocol boundary
[Official SDK](https://github.com/modelcontextprotocol/typescript-sdk) is pinned in lockfile. The current [authorization specification](https://modelcontextprotocol.io/specification/latest/basic/authorization) was checked; static scoped bearer credentials are a bootstrap compatibility mode, not full MCP OAuth interoperability. No OAuth-compliance claim for downstream login. HTTPS is terminated at the deployment ingress. Provider OAuth and MCP authorization are separate mechanisms.
