import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  manifest: {
    name: "ChatGPT Message Queue",
    description: "Queue ChatGPT messages while a response is generating.",
    permissions: ["storage"],
  },
  dev: {
    server: {
      port: 3690,
    },
  },
});
