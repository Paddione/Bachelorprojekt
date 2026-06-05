// scripts/code-quality/glob.mjs
// Minimal glob → RegExp, anchored full-path. Supports `*` (within a segment)
// and `**` (across segments). No external dependency.

/** Compile a glob to an anchored RegExp. */
function globToRe(glob) {
  let re = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; }
        else re += '.*';
      } else {
        re += '[^/]*';
      }
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp(re + '$');
}

const _cache = new Map();

/** True iff `path` matches `glob`. */
export function matchGlob(path, glob) {
  let re = _cache.get(glob);
  if (!re) { re = globToRe(glob); _cache.set(glob, re); }
  return re.test(path);
}
