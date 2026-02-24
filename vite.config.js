import { build, defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteSingleFile } from "vite-plugin-singlefile"
import copy from 'rollup-plugin-copy'

//For custom extensions
import { readFileSync } from 'fs'

// Read version from package.json
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = packageJson.version;

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {

  console.log(`VITE - Command: ${command}, Mode: ${mode}`);

  return {
    define: {
      '_VERSION_': JSON.stringify(version)
    },
    plugins: [
      svelte(),
      copy({
        
        targets: [
          // Copy the manifest file, and update the version and main file path depending on mode
          {
            src: 'CSXS/*',
            dest: 'dist/CSXS',
            transform: (contents, filename) => contents.toString()
              .replaceAll('_VERSION_', version)
              .replace('_MAIN_FILE_', mode === 'development' ? './dev.html' : './index.html')
          },
          // Copy host files (ExtendScript files)
          {
            src: 'host/*',
            dest: 'dist/host'
          }
        ],
        verbose: true,
        hook: command === 'build' ? 'writeBundle' : 'buildStart'
      }),
      viteSingleFile(),
    ],
  }
})
