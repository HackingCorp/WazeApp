import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a standalone build for Docker runtime
  output: 'standalone',
  images: {
    domains: ['i.pravatar.cc'],
  },
  // Optimisations de performance
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['lucide-react'],
  },
  // Compression
  compress: true,
  // Optimisations des polices
  optimizeFonts: true,
  // Proxy API requests to backend
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/api/v1/:path*` : 'http://wazeapp_backend:3100/api/v1/:path*',
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // Add explicit alias resolution for @ paths
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, '.'),
    };
    
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
};

export default nextConfig;