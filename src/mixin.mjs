////////////////////////////////////////////////////////////////////////////////
//
// Closing over mutable realm globals of interest at evaluation time. We also
// protect against %ObjectPrototype% taint in defineProperty and Proxy. This is
// paranoia; just being thorough because of the nature of the functionality this
// module provides.

const
  { Object, Proxy, TypeError } = getGlobalThis(),
  { assign, create, defineProperties, getOwnPropertyDescriptors } = Object,
  { isPrototypeOf } = Object.prototype,
  { apply, construct } = Reflect,
  IS_CSTR_HANDLER = assign(create(null), { construct: () => ({}) });

////////////////////////////////////////////////////////////////////////////////
//
// The public API is the “Mixin” constructor and the “Mixin.Super” constructor.
// We could have done it all-in-one and pivoted on whether new.target is a
// previously registered #Constructor, but that seemed too cute and a bit
// magical, so I kept the Super constructor distinct from Mixin.
//
// (Another idea scrapped for being too magic was to automatically provision the
// correct instance from MixinSuper by managing an instantiation stack in
// Mixin.prototype.super. With this model, the mixin #Constructor doesn’t need
// to pass any args to super(). This does seem to work but it’d probably be
// asking for trouble.)
//
// Most of the errors we explicitly throw here concern recognizing cases where
// the API is not being used as intended. Since the contract is unavoidably not
// super intuitive, throwing with clear messaging was important. However some of
// these things are opaque to us. For example we can’t statically determine if
// the #Constructor called super correctly — the closest we can get is to
// confirm that Mixin.Super is in its [[Prototype]] chain, which does not really
// tell us the same thing.

export default class Mixin {
  #Constructor;
  #constructorDescriptors;
  #prototypeDescriptors;

  constructor(Constructor) {
    if (isConstructor(Constructor) === false) {
      throw new TypeError('Argument to Mixin must be a constructor');
    }

    if (apply(isPrototypeOf, MixinSuper, [ Constructor ]) === false) {
      throw new TypeError('Argument to Mixin must inherit from Mixin.Super');
    }

    this.#Constructor = Constructor;
    this.#constructorDescriptors = getConstructorPDs(Constructor);
    this.#prototypeDescriptors = getPrototypePDs(Constructor);
  }

  extend(Target) {
    if (isConstructor(Target) === false) {
      throw new TypeError('Mixin extends target must be a constructor');
    }

    setPDs(Target, this.#constructorDescriptors);
    setPDs(Target.prototype, this.#prototypeDescriptors);

    return Target;
  }

  extendObject(target) {
    if (isObject(target) === false) {
      throw new TypeError('Mixin extends target must be an object');
    }

    setPDs(target, this.#prototypeDescriptors);

    return target;
  }

  super(instance) {
    if (isObject(instance) === false) {
      throw new TypeError('Mixin super first argument must be an object');
    }

    construct(this.#Constructor, arguments);

    return instance;
  }
}

class MixinSuper {
  constructor(instance) {
    if (new.target === MixinSuper) {
      throw new TypeError('MixinSuper cannot be constructed directly');
    }

    if (isObject(instance) === false) {
      throw new TypeError('MixinSuper instance argument must be an object');
    }

    return instance;
  }
}

setPDs(Mixin, {
  Super: { enumerable: true, value: MixinSuper },
  [Symbol.toStringTag]: { configurable: true, value: 'Mixin' }
});

setPDs(Mixin.Super, {
  [Symbol.toStringTag]: { configurable: true, value: 'MixinSuper' }
});

////////////////////////////////////////////////////////////////////////////////

function getConstructorPDs(Constructor) {
  const pds = getOwnPropertyDescriptors(Constructor);

  delete pds.length;
  delete pds.name;
  delete pds.prototype;

  return pds;
}

function getGlobalThis() {
  // Not doing the indirect eval thing just in case somebody wants to use this
  // in a context where a CSP is in effect.

  try { return globalThis; } catch {}
  try { return self; } catch {}

  return global;
}

function getPrototypePDs({ prototype }) {
  const pds = getOwnPropertyDescriptors(prototype);

  delete pds.constructor;

  return pds;
}

function isConstructor(value) {
  try {
    return new new Proxy(value, IS_CSTR_HANDLER), true;
  } catch {
    return false;
  }
}

function isObject(value) {
  return Object(value) === value;
}

function setPDs(target, pds) {
  if (isObject(target)) {
    pds = assign(create(null), pds);


    for (const key in pds) {
      pds[key] = assign(create(null), pds[key]);
    }

    defineProperties(target, pds);
  }
}
