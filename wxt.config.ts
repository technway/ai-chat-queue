import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "AI Chat Queue",
    description: "Queue ChatGPT messages while a response is generating.",
    permissions: ["storage"],
  },
  dev: {
    server: {
      port: 3690,
    },
  },
});
