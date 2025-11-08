/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Ignore node-specific modules when bundling for the browser
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
};

export default nextConfig;
