import express from "express";
import { createServer } from "node:http";
import net from "node:net";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT || 3000);
const MAX_SESSIONS = Math.max(1, Number(process.env.MAX_SESSIONS || 3));
const SESSION_MAX_MS = Math.max(60_000, Number(process.env.SESSION_MAX_MS || 30 * 60_000));
const IDLE_MAX_MS = Math.max(60_000, Number(process.env.IDLE_MAX_MS || 15 * 60_000));

const PDP1 = "/app/bin/pdp1";
const RIM = "/app/assets/adventure-simh.rim";
const DRUM = "/app/assets/simh-drum.img";

const app = express();
app.disable("x-powered-by");
app.use(express.static("/app/public", {
  etag: true,
  maxAge: "5m",
  setHeaders(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  }
}));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "eve-pdp1-adventure-testbench",
    activeSessions: sessions.size,
    maxSessions: MAX_SESSIONS
  });
});

const server = createServer(app);
const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 4096
});

const sessions = new Set();

function wsSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(typeof payload === "string" ? payload : Buffer.from(payload));
  }
}

function status(ws, message) {
  wsSend(ws, JSON.stringify({ type: "status", message }));
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : null;
      probe.close(err => err ? reject(err) : resolve(port));
    });
  });
}

async function connectWithRetry(port, child) {
  const deadline = Date.now() + 15_000;
  let lastError;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`PDP-1 exited before opening DCS (code ${child.exitCode})`);
    }

    try {
      return await new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: "127.0.0.1", port });
        const onError = err => {
          socket.destroy();
          reject(err);
        };
        socket.once("error", onError);
        socket.once("connect", () => {
          socket.off("error", onError);
          resolve(socket);
        });
      });
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  throw new Error(`DCS listener did not open: ${lastError?.message || "timeout"}`);
}

class TelnetStripper {
  constructor(socket, onData) {
    this.socket = socket;
    this.onData = onData;
    this.state = "data";
    this.command = null;
  }

  feed(chunk) {
    const out = [];

    for (const byte of chunk) {
      switch (this.state) {
        case "data":
          if (byte === 255) this.state = "iac";
          else out.push(byte);
          break;

        case "iac":
          if (byte === 255) {
            out.push(255);
            this.state = "data";
          } else if (byte === 251 || byte === 252 || byte === 253 || byte === 254) {
            this.command = byte;
            this.state = "option";
          } else if (byte === 250) {
            this.state = "sub";
          } else {
            this.state = "data";
          }
          break;

        case "option": {
          const option = byte;
          if (this.command === 251) {
            // WILL -> DONT
            this.socket.write(Buffer.from([255, 254, option]));
          } else if (this.command === 253) {
            // DO -> WONT
            this.socket.write(Buffer.from([255, 252, option]));
          }
          this.command = null;
          this.state = "data";
          break;
        }

        case "sub":
          if (byte === 255) this.state = "sub-iac";
          break;

        case "sub-iac":
          this.state = byte === 240 ? "data" : "sub";
          break;
      }
    }

    if (out.length) this.onData(Buffer.from(out));
  }
}

function normalizeInput(data) {
  const source = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const out = [];

  for (const byte of source) {
    // Keep the guest terminal deliberately narrow: printable ASCII plus
    // CR, BS, TAB, DEL and ^C.  The simulator console itself is never exposed.
    if (
      byte === 3 ||
      byte === 8 ||
      byte === 9 ||
      byte === 13 ||
      byte === 127 ||
      (byte >= 32 && byte <= 126)
    ) {
      out.push(byte);
    }
  }

  return Buffer.from(out);
}

async function startSession(ws) {
  if (sessions.size >= MAX_SESSIONS) {
    status(ws, "Test bench is busy. Please try again shortly.");
    ws.close(1013, "busy");
    return;
  }

  const session = {
    ws,
    child: null,
    dcs: null,
    dir: null,
    lastActivity: Date.now(),
    closed: false
  };
  sessions.add(session);

  const cleanup = async () => {
    if (session.closed) return;
    session.closed = true;
    sessions.delete(session);

    try { session.dcs?.destroy(); } catch {}
    try { session.child?.kill("SIGTERM"); } catch {}

    if (session.child && session.child.exitCode === null) {
      setTimeout(() => {
        try {
          if (session.child?.exitCode === null) session.child.kill("SIGKILL");
        } catch {}
      }, 1000).unref();
    }

    if (session.dir) {
      try { await fsp.rm(session.dir, { recursive: true, force: true }); } catch {}
    }
  };

  ws.once("close", cleanup);
  ws.once("error", cleanup);

  try {
    status(ws, "Preparing an isolated PDP-1...");

    session.dir = await fsp.mkdtemp(path.join(os.tmpdir(), "eve-pdp1-"));
    const drumPath = path.join(session.dir, "adventure.drum");
    const iniPath = path.join(session.dir, "adventure.ini");
    await fsp.copyFile(DRUM, drumPath);

    const dcsPort = await freePort();
    const ini = `; Eve Quinn stock-SIMH Adventure browser session
set cpu pdp1d48
set cpu 16k

set drp enabled
attach drp ${drumPath}

set dcs enabled
set dcs lines=1
set dcsl0 8b
attach dcs ${dcsPort}

deposit ss 2

attach ptr ${RIM}
boot ptr
`;
    await fsp.writeFile(iniPath, ini, "utf8");

    session.child = spawn(PDP1, [iniPath], {
      cwd: session.dir,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let simulatorLog = "";
    const appendLog = chunk => {
      simulatorLog += chunk.toString("utf8");
      if (simulatorLog.length > 16_384) simulatorLog = simulatorLog.slice(-16_384);
    };
    session.child.stdout.on("data", appendLog);
    session.child.stderr.on("data", appendLog);

    session.child.once("exit", code => {
      if (!session.closed) {
        status(ws, `PDP-1 stopped (code ${code ?? "unknown"}).`);
        ws.close(1011, "simulator stopped");
      }
    });

    session.dcs = await connectWithRetry(dcsPort, session.child);
    session.dcs.setNoDelay(true);

    const telnet = new TelnetStripper(session.dcs, data => {
      session.lastActivity = Date.now();
      wsSend(ws, data);
    });

    session.dcs.on("data", chunk => telnet.feed(chunk));
    session.dcs.once("error", err => {
      if (!session.closed) {
        status(ws, `DCS connection error: ${err.message}`);
        ws.close(1011, "dcs error");
      }
    });
    session.dcs.once("close", () => {
      if (!session.closed) ws.close(1000, "session ended");
    });

    // The compatibility path intentionally consumes one initial character as
    // the session-start indication because stock SIMH has no guest-visible
    // TCP connected bit. Send CR only: no trailing LF is left in the shared
    // Type 630 scanner.
    setTimeout(() => {
      if (!session.closed && session.dcs && !session.dcs.destroyed) {
        session.dcs.write(Buffer.from("\r", "ascii"));
      }
    }, 150);

    ws.on("message", data => {
      session.lastActivity = Date.now();
      const clean = normalizeInput(data);
      if (clean.length && session.dcs && !session.dcs.destroyed) {
        session.dcs.write(clean);
      }
    });

    status(ws, "PDP-1 online. You have a private Adventure session.");

    const timer = setInterval(() => {
      const now = Date.now();
      const tooOld = now - session.lastActivity > IDLE_MAX_MS;
      if (tooOld) {
        status(ws, "Session closed after being idle.");
        ws.close(1000, "idle");
      }
    }, 30_000);
    timer.unref();
    ws.once("close", () => clearInterval(timer));

    setTimeout(() => {
      if (!session.closed) {
        status(ws, "Session time limit reached.");
        ws.close(1000, "time limit");
      }
    }, SESSION_MAX_MS).unref();

  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    status(ws, `Could not start PDP-1: ${detail}`);
    ws.close(1011, "startup failed");
    await cleanup();
  }
}

wss.on("connection", ws => {
  startSession(ws);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Eve PDP-1 test bench listening on ${PORT}`);
});
