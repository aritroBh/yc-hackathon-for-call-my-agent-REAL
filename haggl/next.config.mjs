/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NODE_ENV === "production" ? "standalone" : undefined,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: {},
};
export default nextConfig;
