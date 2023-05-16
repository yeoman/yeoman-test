export const defaultEnvironment = async () => {
  const dynamicEnv = await import('yeoman-environment');
  return dynamicEnv.createEnv ?? dynamicEnv.default.createEnv;
};
