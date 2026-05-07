import type { BaseEnvironment, BaseGenerator } from '@yeoman/types';
import type GeneratorImplementation from 'yeoman-generator';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import type EnvironmentImplementation from 'yeoman-environment';
import type { IsAny } from 'type-fest';

export type DefaultGeneratorApi = IsAny<GeneratorImplementation> extends true ? BaseGenerator : GeneratorImplementation;
export type DefaultEnvironmentApi = IsAny<EnvironmentImplementation> extends true ? BaseEnvironment : EnvironmentImplementation;
