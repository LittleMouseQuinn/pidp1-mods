# Eve's PDP-1 Adventure Web Test Bench

This is deployment scaffolding for testing the stock-SIMH compatibility work
without adding hosting code to the patch intended for upstream.

The deployment branch is:

`eve/pdp1-web-testbench`

It is based on:

`adventure-stock-simh-2026-09-rebase`

## Architecture

Vercel builds `Dockerfile.vercel` as a container-image function.

The build stage:

1. builds the current pidp1-mods AM1 assembler;
2. builds the current Adventure source with `SIMH_COMPAT`;
3. generates an isolated baseline Type 23 drum image;
4. builds stock SIMH PDP-1 at pinned commit
   `47b7ddabbe5b548cfc32f2fd45f7bed238ff7921`.

The runtime is a small Node HTTP/WebSocket service.

Each browser WebSocket connection gets:

- its own temporary copy of the Adventure drum;
- its own stock SIMH PDP-1 process;
- its own private localhost Type 630 DCS port.

The browser never receives a simulator console. It can only exchange terminal
characters with Adventure's DCS line.

The server also strips and answers SIMH's Telnet option negotiation so the
browser does not need to implement Telnet.

## Session limits

Hosted defaults:

- three concurrent sessions per container instance;
- three-minute idle timeout;
- four-minute absolute session timeout.

Those defaults deliberately stay below the current 300-second Vercel Hobby
function limit so a browser session receives a clean close instead of being
cut off by the platform. Higher-plan deployments can override the application
timeouts, but the Vercel plan's own function-duration ceiling still applies.

Application limits can be changed with:

- `MAX_SESSIONS`
- `IDLE_MAX_MS`
- `SESSION_MAX_MS`

## Vercel

The project root must be the repository root because the container build needs
the pidp1-mods sources.

Vercel's container-image runtime recognizes a root-level
`Dockerfile.vercel`. WebSockets run on Fluid Compute and remain attached to
one function instance for the lifetime of the connection.

For the Little Mouse Hobby workspace, import the
`LittleMouseQuinn/pidp1-mods` repository and select
`eve/pdp1-web-testbench` as the deployment branch. Keep the project root at
the repository root.

After the preview deployment is verified, a custom domain such as
`pdp1.evequinn.org` can be attached to the Vercel project.

Build status is verified by the branch-only end-to-end container smoke test.
