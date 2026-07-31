#!/usr/bin/env node
/**
 * Bundles src/shell/** into www/shell.js.
 *
 * IIFE, not ESM: the output is read off disk by native code and handed to
 * evaluateJavaScript / evaluateJavascript inside a page this project does not
 * control. There is no module loader on the other side and no <script> tag we
 * are allowed to add, so the bundle has to be one self-contained expression.
 *
 * The Capacitor plugin packages bundle in cleanly — at runtime they proxy to
 * window.Capacitor, which the native bridge injects into the remote origin
 * before this script runs.
 */
import { build } from 'esbuild'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const outfile = join(root, 'www', 'shell.js')

await mkdir(join(root, 'www'), { recursive: true })

const result = await build({
  entryPoints: [join(root, 'src', 'shell', 'index.ts')],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari14', 'chrome90'],
  platform: 'browser',
  minify: true,
  sourcemap: false,
  outfile,
  legalComments: 'none',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
})

if (result.errors.length) {
  process.exit(1)
}

// Injected code runs in the dashboard's global scope. An uncaught throw here
// would surface as an error in the web app's own console and could trip its
// Sentry instrumentation, so the whole bundle is fenced.
const bundled = await readFile(outfile, 'utf8')
await writeFile(outfile, `try{\n${bundled}\n}catch(e){console.warn('[q-shell] fatal:',e)}\n`)

const { size } = await import('node:fs').then((fs) => fs.promises.stat(outfile))
console.log(`shell.js  ${(size / 1024).toFixed(1)} kB`)
