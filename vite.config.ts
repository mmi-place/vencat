import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
	server: {
		proxy: { '/api': 'http://127.0.0.1:5000' },
	},
	plugins: [
		vue(),
		tailwindcss(),
		VitePWA({
			workbox: {
				navigateFallbackDenylist: [/^\/api(?:\/|$)/], importScripts: ['/retire-device-alerts.js'],
				globPatterns: ['**/*.{js,css,html,svg,woff2}'],
				runtimeCaching: [{ urlPattern: /\/(background|noel)\.jpg$/, handler: 'CacheFirst', options: { cacheName: 'vencat-background', expiration: { maxEntries: 2, maxAgeSeconds: 30 * 86400 } } }],
			},
			registerType: 'autoUpdate',
			includeAssets: ['favicon.ico', 'retire-device-alerts.js', 'icons/*.png'],
			manifest: {
				name: 'Vencat',
				short_name: 'Vencat',
				description: "Emploi du temps plus beau que CELCAT",
				start_url: "/",
				display: "standalone",
				background_color: "#020618",
				theme_color: '#020618',
				icons: [
					{ src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }
				]
			}
		})
	],
	resolve: {
		alias: {
		'@': fileURLToPath(new URL('./src', import.meta.url))
		},
	},
})
