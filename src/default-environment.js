/**
 * @param {import('@yeoman/types').BaseEnvironmentOptions} options
 * @returns {import('@yeoman/types').BaseEnvironment}
 */
export const createEnv = async options => {
  const DynamicEnvironment = await import('yeoman-environment');
  if (typeof DynamicEnvironment === 'function') {
    return new DynamicEnvironment(options);
  }

  if (typeof DynamicEnvironment.default === 'function') {
    return new DynamicEnvironment.default(options);
  }

  throw new Error(`'yeoman-environment' didn't returned a constructor`);
};
