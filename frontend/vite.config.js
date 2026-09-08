import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 3000,
    proxy: {
      "/api":           "http://127.0.0.1:5005",
      "/get_faqs":      "http://127.0.0.1:5005",
      "/clear_history": "http://127.0.0.1:5005",
      "/health":        "http://127.0.0.1:5005",
    },
  },
});