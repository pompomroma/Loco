/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // TypeScript type-checking still runs on build; we only skip ESLint here to
  // avoid flat-config wiring blocking the Vercel build. Run `pnpm lint` locally.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
