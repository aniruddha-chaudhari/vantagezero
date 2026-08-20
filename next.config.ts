import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Both are barrel-export-heavy (lucide-react especially) - this keeps dev compiles from
  // pulling in the whole package graph just because one icon/chart type was imported.
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
};

export default nextConfig;
