import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Media is served from R2 signed URLs and Cloudflare Stream. We deliberately do
  // NOT run family photos through the Next image optimizer — it would proxy every
  // private image through the serverless function and defeat the signed-URL model.
  images: { unoptimized: true },

  async headers() {
    return [
      {
        // The service worker must not be cached, or family members get stranded
        // on an old build after a deploy.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Private family archive: never let it be indexed or embedded elsewhere.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ]
  },
}

export default nextConfig
