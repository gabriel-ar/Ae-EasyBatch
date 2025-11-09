import { build, defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { viteSingleFile } from "vite-plugin-singlefile"

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

      writeFileSync(manifestPath, manifest, 'utf-8')
      console.log(`Updated manifest.xml to version ${version}`)
    }
  }
}



// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve'
  
  return {
    define: {
      '_VERSION_': JSON.stringify(version)
    },
    plugins: [
      svelte(),
      updateManifest(isDev),
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
      viteSingleFile(),
    ],
  }
})
