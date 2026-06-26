import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const cesiumSource = "node_modules/cesium/Build/Cesium";
const cesiumSourceSegments = cesiumSource.split("/").length;
// This is the base url for static files that CesiumJS needs to load.
// Set to an empty string to place the files at the site's root path
const cesiumBaseUrl = "cesiumStatic";

// https://vitejs.dev/config/
export default defineConfig({
  base: '/eas_pvl/',
  appType: 'mpa',
  define: {
    // Define relative base path in cesium for loading assets
    // https://vitejs.dev/config/shared-options.html#define
    CESIUM_BASE_URL: JSON.stringify(`./${cesiumBaseUrl}`),
  },
  esbuild: {
    supported: {
      'top-level-await': true //browsers can handle top-level-await features
    },
  },
  plugins: [
    // Copy Cesium Assets, Widgets, and Workers to a static directory.
    // If you need to add your own static files to your project, use the `public` directory
    // and other options listed here: https://vitejs.dev/guide/assets.html#the-public-directory
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/ThirdParty/**/*`, dest: cesiumBaseUrl, rename: { stripBase: cesiumSourceSegments } },
        { src: `${cesiumSource}/Workers/**/*`,    dest: cesiumBaseUrl, rename: { stripBase: cesiumSourceSegments } },
        { src: `${cesiumSource}/Assets/**/*`,     dest: cesiumBaseUrl, rename: { stripBase: cesiumSourceSegments } },
        { src: `${cesiumSource}/Widgets/**/*`,    dest: cesiumBaseUrl, rename: { stripBase: cesiumSourceSegments } },
      ],
    }),
  ],
});
