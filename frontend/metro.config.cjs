const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  'react-native-bluetooth-classic': path.resolve(__dirname, 'stubs/react-native-bluetooth-classic.cjs'),
  'react-native-audio-session': path.resolve(__dirname, 'stubs/react-native-audio-session.cjs'),
};

module.exports = config;