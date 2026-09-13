const configuredMediaDomain = process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN || process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN;
const configuredPublicPlatformUrl = process.env.NEXT_PUBLIC_PUBLIC_PLATFORM_URL;
const remoteImageHostnames = new Set(['images.unsplash.com', 'media.yotba.com', 'yotba.vercel.app']);

for (const candidate of [configuredMediaDomain, configuredPublicPlatformUrl]) {
  if (candidate) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'https:' && parsed.hostname) remoteImageHostnames.add(parsed.hostname.toLowerCase());
    } catch {
      // Invalid optional public domain is ignored; local/relative media still works.
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  images: {
    remotePatterns: [
      ...Array.from(remoteImageHostnames, (hostname) => ({ protocol: 'https', hostname })),
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
