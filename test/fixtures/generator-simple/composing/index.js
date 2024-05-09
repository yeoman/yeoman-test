import Generator from 'yeoman-generator';

// Example of a simple generator.
//
// A raw function that is executed when this generator is resolved.
//
// It takes a list of arguments (usually CLI args) and a Hash of options
// (CLI options), the context of the function is a `new Generator.Base`
// object, which means that you can use the API as if you were extending
// `Base`.
//
// It works with simple generator. If you need to do a bit more complex
// stuff, extend from Generator.Base and defines your generator steps
// in several methods.

export default class SimpleGenerator extends Generator {
  async exec(toCompose) {
    console.log(toCompose);
    await this.composeWith(toCompose);
  }
}

SimpleGenerator.description =
  'And add a custom description by adding a `description` property to your function.';
SimpleGenerator.usage = 'Usage can be used to customize the help output';
