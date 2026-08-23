/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle (.next/standalone) — what the production
  // Dockerfile copies, so the runtime image doesn't need the full
  // node_modules tree or the monorepo's other packages' source.
  output: "standalone",
  transpilePackages: ["@bingo/db", "@bingo/shared-types", "@bingo/payments", "@bingo/game-core"],
  // @node-rs/argon2 and @prisma/client ship native addons (.node binaries)
  // loaded via runtime platform detection. Webpack's static bundling mangles
  // that dynamic require, so these must be left as real Node `require`s
  // instead of being bundled.
  experimental: {
    serverComponentsExternalPackages: ["@node-rs/argon2", "@prisma/client"],
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  async headers() {
    // Baseline CSP, not a nonce-based strict one — 'unsafe-inline'/'unsafe-eval'
    // are still required by Next.js's own dev-mode HMR and hydration inline
    // scripts. This is real protection (blocks loading any external script,
    // style, frame, or connect target that isn't this origin) but is a known,
    // documented gap short of the gold-standard nonce-based CSP — tightening
    // it further needs dedicated per-page verification, not a blind swap.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
