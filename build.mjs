import fs from 'fs';

try {
  fs.mkdirSync(new URL('dist', import.meta.url));
} catch (err) {
  if (err.code !== 'EEXIST') {
    throw err;
  }
}

// Yeah, I feel guilty, but it’s a v simple module. We know it just has the one
// export, so adding all of npm just to parse & transform & compile for one line
// change seems silly.

const esm = fs.readFileSync(new URL('src/mixin.mjs', import.meta.url), 'utf8');
const cjs = esm.replace(/export default/, 'const Mixin = module.exports =');

fs.writeFileSync(new URL('dist/mixin.mjs', import.meta.url), esm);
fs.writeFileSync(new URL('dist/mixin.js', import.meta.url), cjs);
