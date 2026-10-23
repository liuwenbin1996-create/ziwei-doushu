/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["lunar-javascript"],
  poweredByHeader: false,
  async redirects() {
    return [
      "/chart",
      "/preview",
      "/heming",
      "/library/:path*",
      "/knowledge/:path*",
    ].map((source) => ({ source, destination: "/", permanent: false }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
