// Stub for Expo Go / web bundling.
// Real iOS AVAudioSession routing is used in EAS / dev-client builds.
const stub = {
  setCategory: async () => null,
  setActive: async () => null,
};

module.exports = stub;
module.exports.default = stub;
