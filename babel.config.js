module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 50+) ya incluye el plugin de react-native-reanimated:
    // NO añadir 'react-native-reanimated/plugin' manualmente (duplicado = error).
    presets: ['babel-preset-expo'],
    // Neutraliza import.meta en node_modules (zustand): ver plugins/strip-import-meta.js.
    plugins: [require('path').resolve(__dirname, 'plugins/strip-import-meta.js')],
  };
};
