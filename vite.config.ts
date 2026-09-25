import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { createApi } from './src/server/api';
import { behaviorsRoot } from './src/server/files';

/** Serves the API from the development server, as src/server/main.ts does in production. */
function behaviorsApi(): Plugin {
  return {
    name: 'behaviors-api',
    configureServer(server) {
      const root = behaviorsRoot();
      server.config.logger.info(`  Behaviors folder: ${root}`);
      server.middlewares.use((req, res, next) => void createApiOnce(root)(req, res, next));
    },
  };
}

let api: ReturnType<typeof createApi> | undefined;
function createApiOnce(root: string) {
  api ??= createApi(root);
  return api;
}

export default defineConfig({
  plugins: [react(), behaviorsApi()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
