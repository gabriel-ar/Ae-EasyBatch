import { build, defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteSingleFile } from "vite-plugin-singlefile"
import copy from 'rollup-plugin-copy'

//For custom extensions
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { basename, join } from 'path'

// Read version from package.json
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = packageJson.version;

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {

  console.log(`VITE - Command: ${command}, Mode: ${mode}`);

  // `--mode check` builds into a separate folder so the symlinked dist/ (served to After Effects) is untouched
  const outDir = mode === 'check' ? 'dist-check' : 'dist';

  const windows = ['prebuilt/EasyBatchSecretStore.x64.dll', 'prebuilt/EasyBatchSecretStore.arm64.dll'];
  const bundle = 'prebuilt/EasyBatchSecretStore.bundle';
  const mac = [`${bundle}/Contents/Info.plist`, `${bundle}/Contents/MacOS/EasyBatchSecretStore`];

  function CopyNativeComponents() {
    const destination = join(outDir, 'native');
    mkdirSync(destination, { recursive: true });

    for (const source of windows) {
      if (!existsSync(source)) continue;
      const target = join(destination, basename(source));
      if (existsSync(target) && readFileSync(source).equals(readFileSync(target))) continue;
      try {
        copyFileSync(source, target);
      } catch (error) {
        if (['EBUSY', 'EACCES', 'EPERM'].includes(error.code)) {
          throw new Error(`Cannot copy ${source} to ${target} (${error.code}). Quit After Effects if it has the DLL loaded, and check file permissions.`);
        }
        throw error;
      }
    }

    if (existsSync(bundle)) {
      const target = join(destination, basename(bundle));
      rmSync(target, { recursive: true, force: true });
      cpSync(bundle, target, { recursive: true });
    }
  }

  return {
    // CEP's forced downleveling so syntax is transpiled for both dev and production.
    esbuild: {
      target: 'es2018'
    },
    build: {
      target: 'es2018',
      outDir
    },
    server: {
      watch: { ignored: ['**/dist-check/**'] }
    },
    define: {
      '_VERSION_': JSON.stringify(version)
    },
    plugins: [
      svelte(),
      {
        name: 'validate-prebuilt-native',
        buildStart() {
          const required = command === 'build' && mode === 'production' ? [...windows, ...mac]
            : process.platform === 'win32' ? [windows[process.arch === 'arm64' ? 1 : 0]]
              : process.platform === 'darwin' ? mac : [];
          for (const file of required) {
            if (!existsSync(file)) {
              throw new Error(`Missing ${file}. Run npm run native:build on the corresponding OS and commit its prebuilt components.`);
            }
          }
          if (command !== 'build') CopyNativeComponents();
        },
        ...(command === 'build' ? { writeBundle: CopyNativeComponents } : {}),
      },
      copy({
        
        targets: [
          // Copy the manifest file, and update the version and main file path depending on mode
          {
            src: 'src/host/manifest.xml',
            dest: `${outDir}/CSXS`,
            transform: (contents, filename) => contents.toString()
              .replaceAll('_VERSION_', version)
              .replaceAll('_EXTENSION_ID_', `com.setreports.${packageJson.name}`)
              .replace('_MAIN_FILE_', mode === 'development' ? './dev.html' : './index.html')
          },
          //Copy debug files (only in development mode)
          ...(mode === 'development' ? [
            {
              src: ['src/host/dev.html', 'src/host/.debug'],
              dest: outDir,
              transform: (contents, filename) => {
                  return contents.toString()
                    .replaceAll('_VERSION_', version)
                    .replaceAll('_EXTENSION_ID_', `com.setreports.${packageJson.name}`);                
              }
            }
          ] : []),
          // Copy host files (ExtendScript files)
          {
            src: ['src/host/host.jsx', 'src/host/json2.js', 'src/host/SecretStore.jsx'],
            dest: `${outDir}/host`
          },
        ],
        verbose: true,
        hook: command === 'build' ? 'writeBundle' : 'buildStart'
      }),
      viteSingleFile(),
    ],
  }
})
