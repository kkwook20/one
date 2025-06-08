import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.py'],
  // 이 부분 추가
  optimizeDeps: {
    exclude: ['**/*.py']
  }
})