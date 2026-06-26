/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // standalone-вывод включается только для Docker-сборки (на Linux).
  // Локально на Windows symlink-трейсинг недоступен (EPERM), поэтому отключён.
  ...(process.env.DOCKER_BUILD
    ? {
        output: "standalone",
        outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
      }
    : {}),
  transpilePackages: ["@doza/db", "@doza/shared"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs", "sharp"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
