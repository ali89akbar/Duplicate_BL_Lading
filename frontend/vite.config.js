import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

process.env.NO_PROXY = 'localhost,127.0.0.1,0.0.0.0,10.224.118.151';
process.env.no_proxy = 'localhost,127.0.0.1,0.0.0.0,10.224.118.151';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5002',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
