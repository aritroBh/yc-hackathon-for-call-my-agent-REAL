import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // This is a standalone app nested in a multi-lockfile repo — pin the
  // file-tracing root to web/ so Next doesn't infer the wrong workspace.
  outputFileTracingRoot: here,
};

export default nextConfig;
