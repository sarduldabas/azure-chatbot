import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, forward /api to the FastAPI server. In containers nginx does the same job.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:8000" } },
});
