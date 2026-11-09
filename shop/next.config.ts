import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingExcludes: { '/*': ['./data/**/*', './test-results/**/*', '.env*'] },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
