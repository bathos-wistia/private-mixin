const Mixin = require('../dist/mixin.js');
const tap = require('tap');

tap.test('Mixin creation API', async tap => {
  tap.equal(typeof Mixin, 'function', 'module exports Mixin function');

  tap.test('Mixin constructor throws for unexpected input', async tap => {
    tap.throws(() => new Mixin(), /must be a constructor/);
    tap.throws(() => new Mixin(() => {}), /must be a constructor/);
    tap.throws(() => new Mixin(class {}), /must inherit from Mixin\.Super/);
    tap.throws(() => new Mixin(Mixin.Super), /must inherit from Mixin\.Super/);
  });

  tap.test('Mixin constructor accepts Mixin.Super subclass', async tap => {
    tap.doesNotThrow(() => new Mixin(class extends Mixin.Super {}));
  });
});

tap.test('Mixin public interface application API', async tap => {
  tap.test('Mixin.prototype.extendObject requires object', async tap => {
    const mixin = new Mixin(class extends Mixin.Super {});
    tap.throws(() => mixin.extendObject(), /must be an object/);
    tap.throws(() => mixin.extendObject(1), /must be an object/);
  });

  tap.test('Mixin.prototype.extendObject copies prototype PDs', async tap => {
    class Source extends Mixin.Super {
      get a() {}
      set a(x) {}
      get b() {}
      set c(x) {}
      d() {}
      [Symbol.for('e')]() {}
      static f() {}
    }

    Source.prototype.g = 1;

    const mixin = new Mixin(Source);
    const target = {};

    tap.equal(target, mixin.extendObject(target), 'extendObject returns input');

    for (const key of [ ...'abcdfg', Symbol.for('e') ]) {
      tap.same(
        Reflect.getOwnPropertyDescriptor(target, key),
        Reflect.getOwnPropertyDescriptor(Source.prototype, key)
      );
    }

    tap.equal(target.hasOwnProperty('constructor'), false);
  });

  tap.test('Mixin.prototype.extendObject requires constructor', async tap => {
    const mixin = new Mixin(class extends Mixin.Super {});
    tap.throws(() => mixin.extend(), /must be a constructor/);
    tap.throws(() => mixin.extend(() => {}), /must be a constructor/);
  });

  tap.test('Mixin.prototype.extend copies cstr & proto PDs', async tap => {
    class Source extends Mixin.Super {
      static a() {}
      static b() {}
      c() {}
      d() {}
    }

    class Target {
      constructor(arg) {}
      static b() {}
      d() {}
    }

    const mixin = new Mixin(Source);

    tap.equal(Target, mixin.extend(Target), 'extend returns input');
    tap.equal(Target.a, Source.a, 'static props are copied');
    tap.equal(Target.b, Source.b, 'collisions overwrite');
    tap.equal(Target.prototype.c, Source.prototype.c, 'proto props are copied');
    tap.equal(Target.prototype.d, Source.prototype.d, 'collisions overwrite');
    tap.equal(Target.name, 'Target', 'name not copied');
    tap.equal(Target.length, 1, 'length not copied');
    tap.equal(Target.prototype.constructor, Target, 'constructor not copied');
    tap.notEqual(Target.prototype, Source.prototype, 'prototype not copied');
  });
});

tap.test('Mixin instance initialization API', async tap => {
  tap.test('Mixin.Super throws for unexpected usage', async tap => {
    tap.throws(() => new Mixin.Super, /cannot be constructed directly/);
    tap.throws(() => new class extends Mixin.Super {}, /must be an object/);
    tap.throws(() => new class extends Mixin.Super {}(1), /must be an object/);
  });

  tap.test('Mixin.Super is otherwise an identity function', async tap => {
    const target = {};
    tap.equal(new class extends Mixin.Super {}(target), target);
  });

  tap.test('Mixin.prototype.super throws for unexpected input', async tap => {
    const mixin = new Mixin(class extends Mixin.Super {});
    tap.throws(() => mixin.super(), /must be an object/);
    tap.throws(() => mixin.super(1), /must be an object/);
  });

  tap.test(
    'Mixin.prototype.super applies the mixin constructor as if it were part ' +
    'of a normal [[Construct]] chain', async tap => {
    const mixin = new Mixin(class extends Mixin.Super {
      constructor(instance) {
        super(instance);
        this.foo = 1;
      }
    });

    tap.equal(mixin.super({}).foo, 1);
  });

  tap.test('Mixin.prototype.super can allocate private fields', async tap => {
    const mixin = new Mixin(class extends Mixin.Super {
      #foo;

      constructor(instance) {
        super(instance);
        this.#foo = 1;
      }

      get foo() {
        return this.#foo;
      }
    });

    const target = mixin.extendObject({});

    tap.throws(() => target.foo);

    mixin.super(target);

    tap.equal(target.foo, 1);
  });
});

tap.test('Mixin doesn’t interfere with inheritance or slots', async tap => {
  const mixin = new Mixin(class extends Mixin.Super {
    #foo = 'foo';

    get foo() {
      return this.#foo;
    }
  });

  class Target extends Map {
    #bar = 'bar';

    constructor() {
      mixin.super(super([ [ 'baz', 'baz' ] ]));
    }

    get bar() {
      return this.#bar;
    }
  }

  mixin.extend(Target);

  const target = new Target;

  tap.assert(target instanceof Map);
  tap.assert(target instanceof Target);
  tap.equal(target.get('baz'), 'baz');
  tap.equal(target.bar, 'bar');
  tap.equal(target.foo, 'foo');
});

tap.test('Examples from README work', async tap => {
  let answerMixin;

  tap.doesNotThrow(() => {
    answerMixin = new Mixin(class extends Mixin.Super {
      #theAnswer = 42;
      #punctuation;

      constructor(instance, punctuation) {
        super(instance);
        this.#punctuation = punctuation;
      }

      theAnswer() {
        return `${ this.#theAnswer++ }${ this.#punctuation }`;
      }
    });
  }, 'creation of answerMixin');

  tap.test('use with Earth constructor', async tap => {
    class Earth {
      constructor() {
        answerMixin.super(this, '!');
      }
    }

    answerMixin.extend(Earth);

    const earth = new Earth;

    tap.equal(earth.theAnswer(), '42!', 'expected output');
    tap.equal(earth.theAnswer(), '43!', 'expected output');
    tap.equal(answerMixin.api.theAnswer(earth), '44!', 'expected output');
  });

  tap.test('use with createEarth factory', async tap => {
    function createEarth() {
      const earth = {};
      answerMixin.extendObject(earth);
      answerMixin.super(earth, '?');
      return earth;
    }

    tap.equal(createEarth().theAnswer(), '42?', 'expected output');
  });

  tap.test('use with createEarth2 factory', async tap => {
    function createEarth2() {
      const earth = {};
      answerMixin.super(earth, '?');
      return earth;
    }

    const earth2 = createEarth2();

    tap.equal(earth2.theAnswer, undefined);
    tap.equal(answerMixin.api.theAnswer(earth2), '42?');
  });
});
