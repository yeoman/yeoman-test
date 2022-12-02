module.exports = {
  extension: ['spec.ts'],
  require: ['mocha-expect-snapshot'],
  'node-option': ['loader=@node-loaders/esbuild/node14'],
};
