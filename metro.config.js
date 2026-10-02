// Metro config — monorepo pnpm workspace (paquete interno @egrouteplan/ui-kit).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Observar los paquetes internos del workspace.
config.watchFolders = [path.resolve(projectRoot, 'packages')];

// Resolución de node_modules (raíz del workspace-app).
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// Symlinks de pnpm (paquetes workspace enlazados).
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// NOTE (02/10/2026): zustand expone una variante ESM con `import.meta` que rompe el
// bundle web (página en blanco). Dos vias probadas y DESCARTADAS aquí:
//  - `unstable_conditionNames` con react-native: limpia import.meta pero rompe el
//    interop de react-navigation en web (TypeError e is not a function).
//  - `resolver.resolveAlias` a los CJS: Metro lo ignora (18 import.meta iguales).
// La via que funciona es el plugin de Babel plugins/strip-import-meta.js (babel.config.js).

module.exports = config;
