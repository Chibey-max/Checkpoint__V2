import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @checkpoint/shared ships TypeScript source; let Next compile it once the package exists.
  transpilePackages: ["@checkpoint/shared"],
};

export default nextConfig;
