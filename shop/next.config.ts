import type { NextConfig } from "next";

// 'unsafe-inline' у скриптов обязателен App Router: RSC-данные приходят в HTML
// встроенным скриптом. Политика закрывает остальное: чужие домены для скриптов,
// соединений и форм, рамки, угон <base> и объект-плагины.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

// В dev политика не отдаётся: React в development требует eval(), а HMR стучится в ws:// —
// замер в браузере поймал «eval() is not supported» и мёртвый hmr-чанк. Покупателя это не касается.
function securityHeaders() {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
    ...(process.env.NODE_ENV === 'production' ? [{ key: 'Content-Security-Policy', value: CSP }] : []),
  ];
}

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  outputFileTracingExcludes: { '/*': ['./data/**/*', './test-results/**/*', '.env*'] },
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }];
  },
};

export default nextConfig;
