import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // sharp is a native addon (a runtime dep of @joelberger/twdb-client) — leave it
      // external so its prebuilt binary is required from node_modules at runtime and
      // unpacked from the asar (auto-unpack-natives), rather than bundled by Vite.
      external: ['sharp'],
    },
  },
});
