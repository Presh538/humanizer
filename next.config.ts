import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Security headers applied to every response ──────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options",    value: "nosniff" },
          // Block clickjacking via iframes
          { key: "X-Frame-Options",            value: "DENY" },
          // Strict referrer for cross-origin requests
          { key: "Referrer-Policy",            value: "strict-origin-when-cross-origin" },
          // Enforce HTTPS for 1 year (only meaningful behind TLS in prod)
          { key: "Strict-Transport-Security",  value: "max-age=31536000; includeSubDomains" },
          // Disable unneeded browser features
          { key: "Permissions-Policy",         value: "camera=(), microphone=(), geolocation=()" },
          // Content Security Policy
          // Next.js requires 'unsafe-inline'/'unsafe-eval' for its runtime.
          // Tighten further (nonce-based) if you move to a standalone server.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self'",
              "img-src 'self' data:",
              "font-src 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
      // ── CORS: restrict API routes to same origin ───────────────────
      {
        source: "/api/(.*)",
        headers: [
          // Empty string = no cross-origin access granted
          { key: "Access-Control-Allow-Origin",  value: "" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
          { key: "Vary",                         value: "Origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
