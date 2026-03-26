import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    https: true,          // enables HTTPS so WebRTC getUserMedia works on LAN
    host: true,           // bind to 0.0.0.0 so LAN phones/tablets can reach this
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3700',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3700',
        ws: true,
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3700',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://localhost:3700',
        changeOrigin: true,
      },
      '/trust': {
        target: 'http://localhost:3700',
        changeOrigin: true,
      },
      '/cert.pem': {
        target: 'http://localhost:3700',
        changeOrigin: true,
      },
      '/localchat.crt': {
        target: 'http://localhost:3700',
        changeOrigin: true,
      },
      '/localchat.mobileconfig': {
        target: 'http://localhost:3700',
        changeOrigin: true,
      },
    },
  },
})
