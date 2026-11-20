import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Served from a GitHub Pages project site (https://<user>.github.io/till/)
// in production, but from the root locally.
const base = process.env.GITHUB_PAGES ? '/till/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Till',
        short_name: 'Till',
        description: 'A simple till: ring up items, take cash or card, and close the day.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#fdf4f5',
        theme_color: '#c93766',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // All sales are saved on the device, so precache the whole app and
        // let the till keep working with no internet.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      },
    }),
  ],
})
