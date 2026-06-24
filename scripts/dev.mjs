#!/usr/bin/env node
/**
 * `npm run dev` — start the dev server, opening the SSH tunnel first if one is
 * configured (SSH_TUNNEL=on in .env). With no tunnel configured this is just
 * `next dev`, so nothing changes for local/RDS/Neon users.
 *
 * If a tunnel is already listening (e.g. you ran `npm run tunnel` yourself) it
 * is reused and left running. A tunnel this script opens is stopped when the
 * dev server exits.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { loadEnv, tunnelEnabled } from "./_env.mjs";

const env = loadEnv();
const host = env.PG_HOST ?? "127.0.0.1";
const port = Number(env.PG_PORT ?? 5433);

/** Resolve true if something is accepting TCP connections at host:port. */
function probe(h, p, timeout = 800) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: h, port: p });
    const done = (ok) => {
      sock.destroy();
      resolve(ok);
    };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    sock.setTimeout(timeout, () => done(false));
  });
}

let tunnel = null;

if (tunnelEnabled(env)) {
  if (await probe(host, port)) {
    console.log(`Tunnel already up on ${host}:${port} — reusing it.`);
  } else {
    console.log("Opening SSH tunnel…");
    const tunnelScript = fileURLToPath(new URL("./tunnel.mjs", import.meta.url));
    tunnel = spawn(process.execPath, [tunnelScript], { stdio: "inherit" });

    let up = false;
    for (let i = 0; i < 40; i++) {
      if (await probe(host, port)) {
        up = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!up) {
      console.error(
        "ERROR: SSH tunnel did not come up within 20s. Check the SSH_* settings in .env."
      );
      tunnel?.kill("SIGINT");
      process.exit(1);
    }
    console.log("Tunnel up.");
  }
}

// Invoke Next's bin directly via node — avoids shell/.cmd portability issues.
const nextBin = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url)
);
const next = spawn(
  process.execPath,
  [nextBin, "dev", "-H", "127.0.0.1", "-p", "3939"],
  { stdio: "inherit" }
);

function stopTunnel() {
  if (tunnel) {
    tunnel.kill("SIGINT");
    tunnel = null;
  }
}
process.on("SIGINT", () => {
  next.kill("SIGINT");
  stopTunnel();
});
process.on("SIGTERM", () => {
  next.kill("SIGTERM");
  stopTunnel();
});
next.on("exit", (code) => {
  stopTunnel();
  process.exit(code ?? 0);
});
