import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Leave off unless debugging: react compiler has caused blank-hydration issues in some dev setups.
  // Polling avoids macOS EMFILE from too many native file watchers (Watchpack); fixes blank 404s when webpack cache breaks.
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default nextConfig;
