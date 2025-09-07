import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // For project pages hosted at https://<user>.github.io/MapCraft/
  base: '/MapCraft/',
  plugins: [react()],
})
