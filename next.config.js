/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloud Run デプロイ用（Dockerfile の standalone モードに対応）
  output: 'standalone',
  experimental: {
    // pdf-parse / pdfjs-dist は webpack バンドル対象から除外して
    // Node.js のネイティブ require で動かす（Next.js 14.x）
    serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  },
};

module.exports = nextConfig;
