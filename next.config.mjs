/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for a slim Docker image (`node server.js`).
  output: "standalone",
  // This project sits beside sibling apps with their own lockfiles; pin the
  // trace root to this dir so standalone output lands at .next/standalone/
  // (not nested under the inferred monorepo root).
  outputFileTracingRoot: import.meta.dirname,
  // pg is a server-only native-ish dep; keep it out of any client bundle attempts.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
