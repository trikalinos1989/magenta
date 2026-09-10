import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow longer API routes for uploads / polling
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
