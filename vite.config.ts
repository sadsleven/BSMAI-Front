import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Las pruebas cubren lógica pura y generación de Excel: no hace falta DOM.
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
})
