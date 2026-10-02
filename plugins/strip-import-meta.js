/**
 * strip-import-meta — neutraliza `import.meta` en dependencias de node_modules.
 *
 * POR QUÉ EXISTE (medido 02/10/2026): zustand (v4 y v5) expone una variante ESM
 * (.mjs) con `import.meta.env ? import.meta.env.MODE : void 0`. Metro 0.82 con
 * `unstable_enablePackageExports` la resuelve en la build WEB y el bundle se sirve
 * como <script> clásico (sin type="module") → `SyntaxError: Cannot use
 * 'import.meta' outside a module` al parsear → la app no arranca y la página
 * queda EN BLANCO. La build nativa nunca lo sufre (Hermes va por otra variante).
 *
 * QUÉ HACE:
 *  1. `import.meta.env ? X : Y` (el patrón de zustand) → `undefined` (entera la
 *     condicional; dejar `undefined.env` dentro sería un TypeError en runtime).
 *  2. Cualquier otro `import.meta.*` en node_modules → `undefined` (parsea y
 *     ejecuta; los paquetes que lo usan ya no funcionaban en Metro de todas formas).
 *
 * ALCANCE: solo ficheros de node_modules. El código propio no usa import.meta
 * (verificado por grep en todo el repo).
 */
module.exports = function stripImportMeta({ types: t }) {
  const esImportMeta = (nodo) =>
    t.isMemberExpression(nodo) &&
    t.isMetaProperty(nodo.object) &&
    nodo.object.meta.name === 'import';

  return {
    name: 'strip-import-meta',
    visitor: {
      // 1) La condicional entera (patrón zustand). Se evalúa ANTES de descender
      //    a los MetaProperty hijos, así no quedan `undefined.env` sueltos.
      ConditionalExpression(path, state) {
        if (!state.filename || !state.filename.includes('node_modules')) return;
        if (esImportMeta(path.node.test)) {
          path.replaceWith(t.identifier('undefined'));
        }
      },
      // 2) Cualquier otro import.meta que quedara suelto.
      MetaProperty(path, state) {
        if (!state.filename || !state.filename.includes('node_modules')) return;
        if (path.node.meta.name === 'import') {
          path.replaceWith(t.identifier('undefined'));
        }
      },
    },
  };
};
