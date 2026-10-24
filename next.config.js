/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloud Run デプロイ用（Dockerfile の standalone モードに対応）
  output: 'standalone',
  // pdf-parse / pdfjs-dist は webpack バンドル対象から除外して
  // Node.js のネイティブ require で動かす（Next.js 15 で experimental.serverComponentsExternalPackages から改名）
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            // Firebase signInWithPopup が Google OAuth ポップアップと
            // 通信できるよう same-origin-allow-popups に緩和する
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
