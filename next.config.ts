import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.1.190",
    "https://acquisition-carroll-innovative-continually.trycloudflare.com",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "qcgvzdlfsxybrmloijpt.supabase.co",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
