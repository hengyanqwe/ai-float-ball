import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
      },
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'lib/index.ts'),
      name: 'AIFloatBall',
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: ['react', 'react-dom', '@ant-design/icons', 'axios', 'marked'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          '@ant-design/icons': 'AntdIcons',
          'axios': 'axios',
          'marked': 'marked'
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name === 'style.css') return 'index.css';
          return assetInfo.name || '';
        }
      }
    },
    sourcemap: true,
    emptyOutDir: false,
    cssCodeSplit: false
  }
}) 