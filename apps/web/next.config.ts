import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  // En el monorepo, el web está en apps/web. transpilePackages le dice a Next
  // que también transpile los packages workspace que importamos.
  transpilePackages: ['@impacto/shared', '@impacto/ui'],
};

export default withNextIntl(config);
