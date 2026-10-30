import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    agentUpgrade: "security",
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  allowedDevOrigins: ['103.30.73.127', '10.0.32.127'],
  async redirects() {
    return [
      {
        source: '/contact',
        destination: '/contacts',
        permanent: true,
      },
      {
        source: '/contact/:path*',
        destination: '/contacts/:path*',
        permanent: true,
      },
      {
        source: '/organisation',
        destination: '/organizations',
        permanent: true,
      },
      {
        source: '/organisation/:path*',
        destination: '/organizations/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
