import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
  ],
  server: { port: 4321 },
  vite: {
    ssr: {
      // Не инлайнить Prisma в SSR-бандл — иначе ломается импорт ".prisma/client/default".
      // Node разрешит их в рантайме из node_modules.
      external: ["@prisma/client", ".prisma/client"],
    },
  },
});
