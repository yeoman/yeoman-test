/**
 * @param {import('@yeoman/types').BaseEnvironmentOptions} options
 * @returns {import('@yeoman/types').BaseEnvironment}
 */
export const createEnv = async options => {
  const DynamicEnv = await import('yeoman-environment');
  if (typeof DynamicEnv === 'function') {
    return new DynamicEnv(options);
  }

  if (typeof DynamicEnv.default === 'function') {
    return new DynamicEnv.default(options);
  }

  throw new Error(`'yeoman-environment' didn't returned a constructor`);
};
