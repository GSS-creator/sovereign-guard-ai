import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import fs from "fs";
import path from "path";

// Load .dev.vars into process.env so server.ts can read them in Vite dev mode
function loadDevVars(): Record<string, string> {
  const devVarsPath = path.resolve(process.cwd(), ".dev.vars");
  if (!fs.existsSync(devVarsPath)) return {};
  return Object.fromEntries(
    fs.readFileSync(devVarsPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))
      .map((l) => l.split("=").map((p) => p.trim()) as [string, string])
      .filter(([k]) => k)
      .map(([k, v]) => [k, v ?? ""])
  );
}

const devVars = loadDevVars();

export default defineConfig({
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  define: {
    // Expose .dev.vars as process.env.* for the server-side gateway shim
    ...Object.fromEntries(
      Object.entries(devVars).map(([k, v]) => [
        `process.env.${k}`,
        JSON.stringify(v),
      ])
    ),
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
