import nextConfig from 'eslint-config-next';

const config = [
  ...nextConfig,
  {
    ignores: ['.next/**', 'node_modules/**', 'android/**'],
  },
];

export default config;
