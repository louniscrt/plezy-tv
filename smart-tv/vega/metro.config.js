const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const fs = require('node:fs');
const path = require('node:path');
const modules = fs.realpathSync(path.join(__dirname,'node_modules'));
module.exports = mergeConfig(getDefaultConfig(__dirname), {
  watchFolders:[modules],
  resolver:{nodeModulesPaths:[modules]},
});
