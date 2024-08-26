import type { BaseEnvironment, BaseGenerator } from '@yeoman/types';
import type GeneratorImplementation from 'yeoman-generator';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import type EnvironmentImplementation from 'yeoman-environment';
import type { IfAny } from 'type-fest';

export type DefaultGeneratorApi = IfAny<
  typeof GeneratorImplementation,
  BaseGenerator,
  typeof GeneratorImplementation extends BaseGenerator ? typeof GeneratorImplementation : BaseGenerator
>;
export type DefaultEnvironmentApi = IfAny<
  typeof EnvironmentImplementation,
  BaseEnvironment,
  typeof EnvironmentImplementation extends BaseEnvironment ? typeof EnvironmentImplementation : BaseEnvironment
>;
