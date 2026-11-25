import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
	define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
	server: {
		// xfwd: the API sees the real host (X-Forwarded-Host), needed by the same-origin check of the account routes.
		proxy: { '/api': { target: 'http://127.0.0.1:' + (process.env.PORT || 5000), changeOrigin: true, xfwd: true } },
		// Hosts allowed in development (tunnels): VITE_ALLOWED_HOSTS=example.com,other.com
		allowedHosts: process.env.VITE_ALLOWED_HOSTS ? process.env.VITE_ALLOWED_HOSTS.split(',') : undefined,
	},
	plugins: [
		vue(),
		tailwindcss(),
		VitePWA({
			workbox: {
				navigateFallbackDenylist: [/^\/api(?:\/|$)/], importScripts: ['/retire-device-alerts.js'],
				globPatterns: ['**/*.{js,css,html,svg,woff2}'],
				// API answers depend on the signed-in account: the app keeps them itself, per account. The worker only caches public files.
				cleanupOutdatedCaches: true,
				runtimeCaching: [
					{ urlPattern: /\/(?:(?:background|noel)\.jpg|backgrounds\/[^/]+\.jpg)$/, handler: 'CacheFirst', options: { cacheName: 'vencat-background', expiration: { maxEntries: 8, maxAgeSeconds: 30 * 86400 } } },
					{ urlPattern: /\/catalogues\/[^/]+\.json$/, handler: 'StaleWhileRevalidate', options: { cacheName: 'vencat-catalogues', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 86400 } } },
					{ urlPattern: /\/icons\/[^/]+\.png$/, handler: 'CacheFirst', options: { cacheName: 'vencat-icons', expiration: { maxEntries: 10, maxAgeSeconds: 90 * 86400 } } },
				],
			},
			registerType: 'autoUpdate',
			// The manifest is also served by the development server, so an install from a dev or tunnel URL keeps its icon.
			devOptions: { enabled: true, suppressWarnings: true },
			includeAssets: ['favicon.ico', 'retire-device-alerts.js', 'icons/*.png'],
			manifest: {
				name: 'Vencat',
				short_name: 'Vencat',
				description: "Emploi du temps plus beau que CELCAT",
				// The app is the root of the site: same identity and start page whatever page it was installed from.
				id: "/",
				start_url: "/",
				scope: "/",
				lang: "fr",
				// Chrome / Edge: open links of the site in the installed app and reuse its window instead of a new one.
				handle_links: "preferred",
				launch_handler: { client_mode: ["navigate-existing", "auto"] },
				display: "standalone",
				background_color: "#020511",
				theme_color: '#020511',
				icons: [
					{ src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
					{ src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
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
