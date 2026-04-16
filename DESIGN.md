# Design: A CLI for MCP

**Author:** Will Powelson
**Status:** v0.1 (beta)
**Date:** 2026-03

## MCP is the protocol. This CLI is one interface to it.

MCP handles tool discovery and invocation. This CLI turns that into a shell interface.

The important property is discovery. Agents need to know what the system can do now, not what the wrapper knew at release time. MCP gives us that. The CLI can stay thin and expose whatever the server currently supports.

The bet here is simple: agents are better at driving shell commands than they are at speaking MCP directly, so wrap MCP in a CLI.

## Why a shell interface

Current agent harnesses already know how to run commands, capture stdout and stderr, chain steps together, and react to exit codes. A CLI fits into that world with very little extra work.

That may change. For now, this is the path of least resistance.

A related issue is context handling. Some harnesses do a poor job with large tool listings. A CLI gives the harness tighter control over what gets surfaced to the model and when.

That is the whole argument for the wrapper.

## Design principles

### Keep the wrapper dumb

This CLI should do as little as possible beyond making the server usable from the shell.

It should not orchestrate workflows, manage long-running state, or hide agent logic in the client. If an agent wants to compose five tool calls, the agent or its harness should do that work explicitly.

The split is:

- the server defines capabilities
- the CLI exposes them
- the harness decides how to compose them

If the wrapper gets clever, ownership gets muddy fast.

### Written for agents

This CLI is written for agents first, not humans first.

That means it should be scriptable, dynamic, and explicit about what is stable. Airtable does not currently make backward-compatibility guarantees for these tool surfaces, and the CLI should not pretend otherwise.

If those guarantees get stronger later, they should come from the server side, not from wrapper folklore.

### Discover tools at runtime

The CLI discovers tools from the server at runtime and exposes them directly.

When the MCP team ships a new tool, the CLI should see it immediately. No wrapper release should be needed just to expose a command the server already has.

The CLI only needs a release when the CLI itself changes: flag parsing, output behavior, auth flows, caching, and similar client-side concerns.

### Stability

The CLI interface is not stable yet.

We expect to learn from usage, so flags, output shape, and other interface details may still change. Stability is a goal, not a claim.

The discovered tool catalog is a separate question. It comes from the server at runtime and will change as the server changes.
