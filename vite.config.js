import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { viteSingleFile } from "vite-plugin-singlefile"

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(),
    viteStaticCopy({
      targets: [
        {
          src: 'CSXS/*',
          dest: 'CSXS'
        },
        {
          src: 'host/*',
          dest: 'host'
        },
        
      ]
    }),
     viteSingleFile()
  ],
})
