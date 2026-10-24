import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // No heredar el postcss/tailwind de la carpeta padre
  css: { postcss: {} },
  server: { port: 5180, strictPort: true },
});
