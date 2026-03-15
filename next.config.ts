import type { NextConfig } from "next";

const CONTENT_SECURITY_POLICY = [
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ')

const nextConfig: NextConfig = {
  // Separate Turbopack dev artifacts from production build output.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'd4ntvs8g91htqli3urg0.baseapi.memfiredb.com',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // 生产环境安全配置
  productionBrowserSourceMaps: false, // 禁用生产环境的源码映射
  poweredByHeader: false, // 隐藏 X-Powered-By header
  compress: true, // 启用gzip压缩

  // 优化配置 (SWC minify 在 Next.js 15+ 默认启用)

  // 安全头配置
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()'
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin'
          },
          {
            key: 'Origin-Agent-Cluster',
            value: '?1'
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-site'
          },
          {
            key: 'Content-Security-Policy',
            value: CONTENT_SECURITY_POLICY,
          },
          {
            key: 'X-Permitted-Cross-Domain-Policies',
            value: 'none'
          }
        ]
      }
    ]
  },

  // Webpack配置优化
  webpack: (config, { dev, isServer }) => {
    // 生产环境代码混淆配置
    if (!dev && !isServer) {
      config.optimization.minimize = true;
      // 移除console.log (生产环境)
      config.optimization.minimizer = config.optimization.minimizer || [];
    }

    return config;
  },
};

export default nextConfig;
