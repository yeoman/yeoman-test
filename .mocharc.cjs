module.exports = {
  extension: ['spec.ts'],
  require: ['mocha-expect-snapshot'],
  'node-option': ['loader=@esbuild-kit/esm-loader'],
};
