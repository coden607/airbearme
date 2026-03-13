import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig(({ mode }) => {
    // Set NODE_ENV based on the mode
    process.env.NODE_ENV = mode;
    return {
        plugins: [react()],
        root: path.resolve(__dirname, 'client'),
        build: {
            outDir: path.resolve(__dirname, 'dist/public'),
            emptyOutDir: true,
            sourcemap: true,
            minify: 'terser',
            terserOptions: {
                compress: {
                    drop_console: mode === 'production',
                },
            },
        },
        server: {
            port: 3000,
            open: true,
        },
    };
});
