const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Produce a standalone build for Docker runtime
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    domains: ['localhost', 'api.wazeapp.xyz'],
    formats: ['image/avif', 'image/webp'],
  },
  webpack: (config, { isServer }) => {
    // Add explicit alias resolution for @ paths
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    };
    
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
  experimental: {
    // Helps Next standalone tracing when used in Docker multi-stage
    // (the deploy script may override/extend this)
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
};

module.exports = nextConfig;

// Add standalone output for Docker
module.exports = {
  ...module.exports,
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
}

// Add standalone output for Docker
module.exports = {
  ...module.exports,
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
}

// Add standalone output for Docker
module.exports = {
  ...module.exports,
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
}
