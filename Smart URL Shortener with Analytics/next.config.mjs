import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

const nextConfig = {
  serverExternalPackages: ['geoip-lite'],
  turbopack: {
    root: projectRoot,
  },
  typescript: {
    tsconfigPath: 'tsconfig.next.json',
  },
}

export default nextConfig