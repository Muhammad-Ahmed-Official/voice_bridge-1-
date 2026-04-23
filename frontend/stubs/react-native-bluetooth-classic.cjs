// Stub for Expo Go / web bundling.
// In an EAS / local dev-client build the real native package (installed via
// `npm install react-native-bluetooth-classic`) takes precedence because
// Metro resolves node_modules before extraNodeModules fallbacks.
const stub = {
  getBondedDevices: async () => [],
  connectToDevice: async () => null,
  disconnectFromDevice: async () => null,
};

module.exports = stub;
module.exports.default = stub;
