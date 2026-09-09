/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Build output directory.
   *
   * `next build` and `next dev` share `.next`, so running a production build
   * while a dev server is up replaces the dev chunks with hashed production
   * ones. Every script tag then 404s, React never hydrates, and forms silently
   * fall back to a native GET submit — which looks like a broken login, not a
   * broken build. Set NEXT_DIST_DIR to build somewhere else instead.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  // The shared package ships TypeScript source rather than a build step.
  transpilePackages: ['@tenzopay/shared'],
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
