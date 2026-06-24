import { readFileSync } from "node:fs";

/**
 * Minimal .env loader for the dev/tunnel helper scripts. The Next app loads
 * .env on its own; these scripts run outside Next, so they parse it here.
 * Real process.env values take precedence over the file.
 */
export function loadEnv(file = ".env") {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return { ...process.env };
  }
  const out = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return { ...out, ...process.env };
}

/** Is the SSH tunnel feature switched on in config? */
export function tunnelEnabled(env) {
  return ["on", "true", "1", "yes"].includes(
    String(env.SSH_TUNNEL ?? "").toLowerCase()
  );
}
