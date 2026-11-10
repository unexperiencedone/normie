import type { NextConfig } from "next";

const API = process.env.NORMIE_API_URL ?? process.env.DBFORGE_API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // Live dashboard: every screen depends on the signed-in user and live database state,
  // so there is nothing useful to prerender. Keep the classic dynamic model.
  cacheComponents: false,
  // Docker builds set NEXT_OUTPUT=standalone: a self-contained server.js with only the needed files.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Same-origin proxy to FastAPI => the httpOnly session cookie just works and there is no CORS.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
  devIndicators: false,
  // The rewrite proxy kills idle upstream requests after 30 s by default; LLM turns can think
  // for minutes. The API also sends SSE keepalives every 15 s (routes_chat.py).
  experimental: { proxyTimeout: 15 * 60 * 1000 },
  compress: false, // never buffer the SSE chat stream
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
