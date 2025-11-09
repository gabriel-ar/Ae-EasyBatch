import { build, defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteSingleFile } from "vite-plugin-singlefile"
import copy from 'rollup-plugin-copy'


//For custom extensions
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// Read version from package.json
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))
const version = packageJson.version

function updateManifest(isDev) {
  return {
    name: 'update-manifest',
    buildStart() {
      const manifestPath = resolve(__dirname, 'CSXS/manifest.xml');
      let manifest = readFileSync(manifestPath, 'utf-8');

      // Update version placeholder
      manifest = manifest.replace(
        /ExtensionBundleVersion="[^"]*"/,
        `ExtensionBundleVersion="${version}"`
      ).replace(
        /<Extension Id=".*?" Version="[^"]*" \/>/,
        `<Extension Id="com.settools.easybatch.panel" Version="${version}" />`
      );

      // Update MainPath based on isDev
      const mainPath = isDev ? './dev.html' : './index.html';
      manifest = manifest.replace(
        /<MainPath>.*<\/MainPath>/,
        `<MainPath>${mainPath}</MainPath>`
      );
      1
      writeFileSync(manifestPath, manifest, 'utf-8')
      console.log(`Updated manifest.xml to version ${version}`)
    }
  }
}



// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {

  console.log(`Command: ${command}, Mode: ${mode}`);

  return {
    define: {
      '_VERSION_': JSON.stringify(version)
    },
    plugins: [
      svelte(),
      copy({
        targets: [
          {
            src: 'CSXS/*',
            dest: 'dist/CSXS',
            transform: (contents, filename) => contents.toString()
              .replaceAll('_VERSION_', version)
              .replace('_MAIN_FILE_', mode === 'development' ? './dev.html' : './index.html')
          },
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
