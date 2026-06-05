import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5173,
    // Proxy API requests to backend server in development
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // Forward cookies for authentication (default behavior, but explicit for clarity)
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Cookies are automatically forwarded by http-proxy-middleware
            // This is just for logging/debugging
            if (req.headers.cookie) {
              console.log('[Vite Proxy] Forwarding cookies to backend');
            }
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            // Set-Cookie headers are automatically forwarded
            // Adjust cookie attributes if needed for same-origin
            const setCookieHeaders = proxyRes.headers['set-cookie'];
            if (setCookieHeaders) {
              // Remove domain restriction for localhost proxy
              const modifiedHeaders = Array.isArray(setCookieHeaders)
                ? setCookieHeaders.map((header: string) => 
                    header.replace(/;\s*domain=[^;]+/gi, '')
                  )
                : [setCookieHeaders].map((header: string) => 
                    header.replace(/;\s*domain=[^;]+/gi, '')
                  );
              proxyRes.headers['set-cookie'] = modifiedHeaders;
            }
          });
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
