import { viteStaticCopy } from 'vite-plugin-static-copy'
import { defineConfig } from 'vite'
import { resolve } from "node:path"

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: resolve(__dirname, 'package.json'), dest: '.' },
        { src: resolve(__dirname, 'README.md'), dest: '.' },
      ]
    })
  ],
  build: {
    outDir: 'dist',
    lib: {
      entry: 'src/index.ts',
      name: 'ReactiveEventSystem',
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: ['@alekstar79/reactivity'],
      output: {
        exports: "named",
        globals: {
          '@alekstar79/reactivity': 'reactivity'
        }
      }
    },
    minify: 'esbuild',
    sourcemap: true,
    target: 'ES2022'
  }
})
