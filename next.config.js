/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'Permissions-Policy', value: 'camera=(self)' },
      ],
    },
  ],
}

module.exports = nextConfig
