/**
 * parcha-import-meta.cjs — neutraliza `import.meta` en los ficheros de zustand.
 *
 * POR QUÉ (medido 02/10/2026): los .mjs de zustand (v4 y v5) usan
 * `import.meta.env ? import.meta.env.MODE : void 0`. En la build WEB, Metro 0.82
 * con `unstable_enablePackageExports` resuelve esa variante y la deja verbatim en
 * un bundle que se sirve como <script> clásico → SyntaxError al parsear → la web
 * queda EN BLANCO. La build nativa no lo sufre (resuelve los CJS).
 *
 * Vias probadas y descartadas el mismo día:
 *  - `resolver.unstable_conditionNames` con react-native: rompe el interop de
 *    react-navigation en web (TypeError e is not a function).
 *  - `resolver.resolveAlias` a los CJS: Metro lo ignora.
 *  - Plugin de Babel: los .mjs de node_modules no pasan por él.
 *
 * Este script corre como `postinstall` (npm lo ejecuta también en Vercel CI),
 * así el parche reaparece siempre que node_modules se reconstruya.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'node_modules', 'zustand');
// El patrón exacto de zustand (con o sin espacios tras el minificado del bundle
// no importa: aquí se parchea el FUENTE que Metro luego transforma).
const PATRON = /import\.meta\.env\s*\?\s*import\.meta\.env\.MODE\s*:\s*void\s*0/g;

let ficheros = 0; let sustituciones = 0;

function recorre(dir) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) { recorre(ruta); continue; }
    if (!/\.(mjs|js)$/.test(entrada.name)) continue;
    const antes = fs.readFileSync(ruta, 'utf8');
    const despues = antes.replace(PATRON, 'void 0');
    if (antes !== despues) {
      fs.writeFileSync(ruta, despues);
      ficheros++; sustituciones += (antes.match(PATRON) || []).length;
    }
  }
}

if (!fs.existsSync(RAIZ)) {
  console.log('[parcha-import-meta] zustand no está instalado, nada que hacer.');
  process.exit(0);
}
recorre(RAIZ);
console.log(`[parcha-import-meta] zustand parcheado: ${sustituciones} sustituciones en ${ficheros} ficheros.`);

// Verificación: no queda NI UN import.meta en zustand.
let restos = 0;
function verifica(dir) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) { verifica(ruta); continue; }
    if (!/\.(mjs|js)$/.test(entrada.name)) continue;
    restos += (fs.readFileSync(ruta, 'utf8').match(/import\.meta/g) || []).length;
  }
}
verifica(RAIZ);
if (restos > 0) {
  console.error(`[parcha-import-meta] FALLO: quedan ${restos} import.meta en zustand.`);
  process.exit(1);
}
console.log('[parcha-import-meta] verificado: 0 import.meta en zustand.');
