import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

export function IsExclusiveOf(
  properties: string[],
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isExclusiveOf',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: properties,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const object = args.object as Record<string, unknown>;
          return properties.every((property) => object[property] === undefined);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} cannot be combined with ${properties.join(', ')}`;
        },
      },
    });
  };
}
