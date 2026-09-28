import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants as zc, gzipSync } from "node:zlib";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Page strings (src/i18n-pages/*.ts) each export `{ zh, th, en }`. When imported with `?locale=xx`
 * we re-export only that language so tree-shaking drops the other two — the browser downloads
 * one language (see loadPageLocale in src/i18n-ui.ts). Files in another shape still work, just unsplit.
 */
function i18nLocaleSplit(): Plugin {
  return {
    name: "i18n-locale-split",
    enforce: "pre",
    transform(code, id) {
      const m = id.match(/[\\/]src[\\/]i18n-pages[\\/][^\\/?]+\.ts\?(?:.*&)?locale=(zh|th|en)\b/);
      if (!m) return null;
      return {
        code: code.replace(/export\s+default\s*\{\s*zh\s*,\s*th\s*,\s*en\s*,?\s*\}\s*(as\s+const\s*)?;?/, `export default { ${m[1]} };`),
        map: null,
      };
    },
  };
}

/** Write .br and .gz next to each text asset so a VPS server (server/index.ts, SERVE_STATIC=1) or nginx can serve them precompressed. */
function precompress(): Plugin {
  let outDir = "dist";
  return {
    name: "precompress",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const walk = (dir: string): string[] =>
        readdirSync(dir).flatMap((f) => {
          const p = join(dir, f);
          return statSync(p).isDirectory() ? walk(p) : [p];
        });
      for (const file of walk(outDir)) {
        if (!/\.(js|css|html|svg|json|txt|map)$/.test(file) || statSync(file).size < 1024) continue;
        const buf = readFileSync(file);
        writeFileSync(`${file}.gz`, gzipSync(buf, { level: 9 }));
        writeFileSync(`${file}.br`, brotliCompressSync(buf, { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } }));
      }
    },
  };
}

/** Our kit + antd internals are side-effect free (CSS aside); lets unused barrel re-exports drop out of chunks. */
function moduleSideEffects(id: string, external: boolean): boolean | undefined {
  if (external) return true;
  if (/\.(css|less)($|\?)/.test(id)) return true;
  if (/[\\/]src[\\/]v2[\\/]components[\\/][^\\/]+\.tsx?$/.test(id)) return false;
  if (/node_modules[\\/](rc-[^\\/]+|@rc-component[\\/][^\\/]+|antd|@ant-design[\\/][^\\/]+)[\\/]/.test(id)) return false;
  return undefined;
}

export default defineConfig({
  plugins: [i18nLocaleSplit(), react(), precompress()],
  build: {
    rolldownOptions: {
      treeshake: { moduleSideEffects },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
