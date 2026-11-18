import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // dist dir can be overridden so a test build never disturbs the running
  // dev server's .next (the platform keeps a dev server on port 3000)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
