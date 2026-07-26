import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { execSync } from "node:child_process";

// Served at the root of the custom domain (app.iel.pt), so the base is "/".
// (It was "/<repo>/" while on the github.io project URL.) Hardcoded rather than
// read from VITE_BASE_PATH because deploy.yml still passes the old repo path.
const base = "/";

// The commit the site was built from, shown in the corner: the only version
// number that cannot drift from what is actually deployed.
function gitCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  base,
  define: {
    __APP_COMMIT__: JSON.stringify(gitCommit()),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
  },
});
