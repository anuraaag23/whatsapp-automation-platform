/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  // Proxies browser requests to /api/* through to the backend container.
  // This runs server-side inside the frontend container, so it always
  // resolves via Docker's internal network (service name "backend") no
  // matter what public URL the browser is actually using to reach the
  // frontend — localhost, a LAN IP, or a tunnel URL that changes every
  // time you restart cloudflared/ngrok. Combined with api-client.ts
  // defaulting to a relative baseURL, this means the app never needs a
  // rebuild just because its public URL changed.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_INTERNAL_URL ?? 'http://backend:3001'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
