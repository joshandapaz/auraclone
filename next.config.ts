import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Aura: Use static export ONLY for CI/Mobile builds. Desktop cloner needs a server. */
  output: process.env.AURA_STATIC_EXPORT === 'true' ? 'export' : undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
