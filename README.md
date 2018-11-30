# private-mixin

This module is a small tool for defining mixins that implement contracts that
use [private fields].

The private fields proposal is at stage 3 at the time of writing — it is not yet
officially part of ECMAScript. It has been implemented in V8 and is available in
node by using the `--harmony-private-fields` V8 flag; it’s also available in
Chrome Canary.

**This lib is intended mainly as a proof of concept.** It is not super advisable
to enable experimental features in ordinary applications. The proposal could
still change. In addition, if we’re patient, there will likely be superior
solutions in 2298 when the decorators proposal reaches stage 3.

<!-- MarkdownTOC autolink=true -->

- [Background](#background)
  - [Utility of private fields](#utility-of-private-fields)
  - [Relationship to the WeakMap pattern](#relationship-to-the-weakmap-pattern)
  - [Challenges of private fields](#challenges-of-private-fields)
  - [Solutions for these problems](#solutions-for-these-problems)
- [Usage](#usage)
  - [Defining a mixin](#defining-a-mixin)
  - [Using a mixin with a class](#using-a-mixin-with-a-class)
  - [Using a mixin with other objects](#using-a-mixin-with-other-objects)
  - [Using mixin contracts at-scope](#using-mixin-contracts-at-scope)
- [How it works](#how-it-works)

<!-- /MarkdownTOC -->

## Background

Before getting into [usage](#usage), I want to provide background on what this
is all about and why I was exploring this space. I’m mainly hoping the code here
will be interesting to other people looking at these problems.

### Utility of private fields

Private fields provide a first-class syntactic solution for associating state
with class instances without exposing it as public properties. This can make it
easier to establish invariants about mutable state; usually it’s less about
preventing the outside from seeing and more about preventing the outside from
changing.

Private instance state is also a key concept when implementing host APIs or
host-like patterns, where instance data properties are unused and the entire API
is realized at the constructor/prototype level. Relatedly, private state enables
objects and methods to exhibit “branding” behaviors, like intrinsic and host
objects often do.

### Relationship to the WeakMap pattern

Private fields follow a similar model to the “WeakMap pattern.” In the WeakMap
pattern, keys are public object instances and values are private state. This,
too, allows implementing host-like APIs, branding, and nearly genuine privacy.
That “nearly” qualifier concerns the fact that `globalThis.WeakMap`,
`WeakMap.prototype.set`, and so on are globally mutable. A determined agent that
is able to evaluate code before your modules could patch these and spy. This
isn’t generally something people worry about, but it’s a notable difference.
Because private fields are syntactic and the implied “hidden WeakMap” is fully
abstracted, the API cannot be tainted or forged.

There is another critical difference between the WeakMap pattern and private
fields. The WeakMap pattern relies on an existing form of privacy in ES, scope.
Scopes are very flexible; it is easy to control exactly what can have access to
a scope’s information. Typically the scope in question would be module scope.
This means with the WeakMap pattern, one can share a single private contract
across multiple classes, or even objects created without classes, behaving like
“slots” in intrinsic and platform APIs. This isn’t true for private fields,
whose analog for scope is “a syntactic class body”. Another difference is that
attempting to access a private field which has not been installed on a given
object will always throw, while in the WeakMap pattern, whether to throw is a
choice.

From here on I’ll sometimes conflate “slot” and “field.” That they are different
is ultimately not observable, though making the latter behave like the former is
not straightforward.

### Challenges of private fields

Examples of APIs that need private state but which cannot easily be implemented
using private fields are easy to find. Among ES intrinsics, common slots are
shared by both `%TypedArray%` and `DataView`. They don’t obtain these from a
common ancestor. The related `ArrayBuffer.isView` method also needs awareness of
this common slot, and isn’t even an instance method. The implication is that
knowledge of these slots is shared by a (hypothetical) scope — it clearly isn’t
local to each of these object definitions when the spec refers to the
[[ViewedArrayBuffer]] slot.

Private fields wouldn’t work out of the box to implement an API like this
because they must always be declared by a single class body and are always
associated with a single specific constructor.

Many APIs that implement an object graph, like the DOM, are challenging to
implement using private fields, but easy (if boilerplate-heavy) to implement
using WeakMaps. This is on account of the same scoping issue.

Less importantly, brand checks that produce consistent error messages in
high-fidelity WebIDL API implementations surprisingly require more rather than
less boilerplate if branding is achieved via private fields rather than WeakMap.

### Solutions for these problems

Naturally, we can continue using WeakMap when private fields are a poor fit. The
proposal today is well-suited for usage at the application level, but often may
be unsuitable for library code. However, in the future it’s expected that the
decorators proposal will provide a hook that will make working with private
fields easier in these contexts. It may alleviate these pain points (and make
the pattern used by this library moot).

All that said, it is possible to share private fields using ordinary scope for
managing privacy even without decorators or reified field keys. It’s just not
super obvious how, and without a tool for abstracting the dance away a bit, it’s
very noisy to achieve. That’s the functionality this library provides: it lets
you use private fields when implementing shared contracts with some of the hoop
jumping tucked away.

## Usage

### Defining a mixin

The library exports a constructor, `Mixin`. This constructor takes a single
argument, a class. That class must extend `Mixin.Super`.

```js
// answer-mixin.mjs

import Mixin from 'private-mixin';

export default new Mixin(class extends Mixin.Super {
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
```

An explicit constructor is only necessary if the mixin needs to take arguments
as part of its API. If there is an explicit constructor, it must pass the first
argument along when it calls `super()`.

### Using a mixin with a class

The `Mixin` instance can be used to apply the mixin to a class or a single
object. Using the mixin to augment a class looks like this:

```js
import answerMixin from './answer-mixin.mjs';

class Earth {
  constructor() {
    answerMixin.super(this, '!');
  }
}

answerMixin.extend(Earth);
```

If we create an instance of `Earth` now...

```js
const earth = new Earth;

earth.theAnswer(); // "42!"
earth.theAnswer(); // "43!"
```

We passed the class to augment to `Mixin.prototype.extend`. This copies any
unique properties of the original mixin (like "theAnswer") to the target. But
there’s a second part to the API, too. The super-like `Mixin.prototype.super`
function should be called by the mixee in its own constructor. It takes the
instance as the first argument plus any additional arguments that should be
passed to the mixin’s constructor. Afterwards, the instance will have been
outfitted with the mixin’s private slots, and any methods that came with the
mixin that rely on those slots will work.

### Using a mixin with other objects

There is another method, `Mixin.prototype.extendObject`, which can be used to
augment objects directly. These could be ad hoc objects or they could be
prototypes meant for used with `Object.create`. Because there is no
`constructor` in this case, static properties cannot be copied over.

```js
function createEarth() {
  const earth = {};
  answerMixin.extendObject(earth);
  answerMixin.super(earth, '?');
  return earth;
}

createEarth().theAnswer(); // "42?"
```

### Using mixin contracts at-scope

The final part of this is the most important. So far we’ve dealt with the idea
that these pieces of functionality can be defined commonly and use the same
field keys, but the other issue we described earlier is sharing the associated
functionality with other module internals (which have knowledge of the the
contract but not themselves be implementers of it). This is handled by
`Mixin.prototype.api`.

```js
answerMixin.api.theAnswer(earth); // "44!"
```

Each of the prototype methods will be “inverted” on `mixin.api` so that the
receiver is the first argument. For accessors that have both `get` and `set`,
arity determines which behavior is applied.

Static methods don’t need to be reflected on `api` because they already work
like this.

It’s up to you what the visibility of any API is. You don’t need to export a
mixin, and you don’t need to use `extend` or `extendObject` at all:

```js
function createEarth2() {
  const earth = {};
  answerMixin.super(earth, '?');
  return earth;
}

const earth2 = createEarth2();

earth2.theAnswer; // undefined
answerMixin.api.theAnswer(earth2); // "42?"
```

## How it works

Private fields always belong, effectively, to a given constructor’s internal
[[Construct]] method. When this is called, either immediately or, if applicable,
at `super()`, the declared fields (or slots, if you prefer) are added to the
new `this`.

You can’t easily invoke [[Construct]] with a specific value of `this` the way
you can invoke [[Call]] with a specific `this`. That makes sense — the creation
of that `this` is a fundamental part of what it’s doing. It walks down the
construction chain (evaluating anything in constructor bodies prior to a
`super()` call). When it reaches the bottom, it creates a new object that
inherits from the prototype of `new.target`. Then it walks back up. Right before
it resumes evaluating a given constructor body is when any fields associated
with that constructor get applied.

While it isn’t super easy to supply a specific `this` to an arbitrary
constructor, it isn’t impossible if the constructor is one that calls `super()`.
If that constructor’s own [[Prototype]] is a constructor that returns a new
object, that object supplants whatever would have otherwise been the instance —
and therefore the `this` value of the next constructor up.

When the “walk” reenters the subclass constructor, any associated slots will
be allocated to its `this`. So what `Mixin` is mainly about is provisioning the
correct object via `Mixin.Super`. It’s really just an identity function! In
effect, it’s very much like inserting an extra constructor into the chain
without actually mutating the real prototype chain. Though it may seem odd, it
fits within the existing instantiation model and doesn’t rely on anything
magical, though the API that results (partly on account of eschewing magic) is
less than ideal.

The module is small and there are tests, so you can check out the source to get
a more complete picture.

[private fields]: https://tc39.github.io/proposal-class-fields/
