import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    // App is served from a subfolder of /release, so assets and the router
    // basename must be prefixed. Override with BASE_PATH if the deploy path
    // differs (must start and end with "/").
    base: env.BASE_PATH ?? "/release/",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        "/papi": {
          target: env.PAPI_TARGET ?? "http://localhost",
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("Authorization", `Bearer ${env.PAPI_BEARER_TOKEN}`);
            });
          },
        },
      },
    },
  };
});
