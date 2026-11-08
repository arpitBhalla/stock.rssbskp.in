import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rahdari PDFs read these fonts from disk at runtime.
  outputFileTracingIncludes: {
    "/api/challan/[id]/pdf": ["./assets/fonts/**"],
    "/r/[token]/pdf": ["./assets/fonts/**"],
  },
};

export default nextConfig;
