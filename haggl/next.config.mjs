/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NODE_ENV === "production" ? "standalone" : undefined,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: {
    serverComponentsExternalPackages: ["@moss-dev/moss", "@moss-dev/moss-core"],
  },
};
export default nextConfig;
