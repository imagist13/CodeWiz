import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  // node_modules 在上级根目录（npm workspaces 提升），所以需要指向根目录才能解析 next
  turbopack: {
    root: "..",
  },
};

export default nextConfig;
