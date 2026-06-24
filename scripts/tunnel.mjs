#!/usr/bin/env node
/**
 * Open an SSH tunnel to a Postgres that's only reachable over SSH, using the
 * SSH_* settings in .env. The tunnel's LOCAL end is PG_HOST:PG_PORT — point the
 * app's PG_HOST/PG_PORT at it (e.g. 127.0.0.1:5433) and it reaches the box's
 * Postgres. Runs in the foreground; Ctrl-C to stop.
 *
 *   npm run tunnel
 *
 * This is generic: it ships with llama-base and reads everything from .env, so
 * no box-specific details live in the repo.
 */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { loadEnv, tunnelEnabled } from "./_env.mjs";

const env = loadEnv();

if (!tunnelEnabled(env)) {
  console.log(
    "SSH_TUNNEL is not enabled in .env — no tunnel needed.\n" +
      "Set SSH_TUNNEL=on (plus SSH_HOST/SSH_USER/SSH_KEY) to use one."
  );
  process.exit(0);
}

const missing = ["SSH_HOST", "SSH_USER"].filter((k) => !env[k]);
if (missing.length) {
  console.error(`SSH tunnel: missing ${missing.join(", ")} in .env`);
  process.exit(1);
}

const localPort = env.PG_PORT ?? "5433";
const remoteHost = env.SSH_REMOTE_HOST ?? "localhost";
const remotePort = env.SSH_REMOTE_PORT ?? "5432";
const sshPort = env.SSH_PORT ?? "22";
const key = String(env.SSH_KEY ?? "").replace(/^~(?=\/)/, homedir());

const args = [
  "-N",
  "-p",
  sshPort,
  "-L",
  `${localPort}:${remoteHost}:${remotePort}`,
  "-o",
  "ExitOnForwardFailure=yes",
  "-o",
  "ServerAliveInterval=30",
  "-o",
  "ServerAliveCountMax=3",
  "-o",
  "StrictHostKeyChecking=accept-new",
];
if (key) args.push("-i", key);
args.push(`${env.SSH_USER}@${env.SSH_HOST}`);

console.log(
  `tunnel: 127.0.0.1:${localPort} -> ${env.SSH_USER}@${env.SSH_HOST}:${sshPort} -> ${remoteHost}:${remotePort}`
);

const child = spawn("ssh", args, { stdio: "inherit" });
child.on("error", (err) => {
  console.error(`failed to start ssh: ${err.message}`);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
