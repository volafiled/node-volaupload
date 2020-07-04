"use strict";

const re_tokenize = /(0x[0-9a-f]+|[+-]?[0-9]+(?:\.[0-9]*(?:e[+-]?[0-9]+)?)?|\d+)/i;
const re_hex = /^0x[0-9a-z]+$/i;
const re_trim_more = /\s+/g;

/**
 * Compare two values using the usual less-than-greater-than rules
 * @param {*} a First value
 * @param {*} b Second value
 * @returns {number} Comparison result
 */
function default_compare(a, b) {
  return a < b ? -1 : (a > b ? 1 : 0);
}


function parseToken(chunk) {
  chunk = chunk.replace(re_trim_more, " ").trim();
  if (re_hex.test(chunk)) {
    return parseInt(chunk.slice(2), 16);
  }
  if (isNaN(chunk)) {
    return chunk;
  }
  return parseFloat(chunk) || chunk;
}


function token_filter(str) {
  return str && str.trim();
}


function tokenize(val) {
  if (typeof val === "number") {
    return [[`${val}`], [val]];
  }
  const tokens = `${val}`.split(re_tokenize).filter(token_filter);
  const numeric = tokens.map(parseToken);
  return [tokens, numeric];
}


/**
 * Natural Sort algorithm for es6
 * @param {*} a First term
 * @param {*} b Second term
 * @returns {Number} Comparison result
 */
function naturalSort (a, b) {
  const [xTokens, xNumeric] = tokenize(a);
  const [yTokens, yNumeric] = tokenize(b);

  // natural sorting through split numeric strings and default strings
  const {length: xTokenLen} = xTokens;
  const {length: yTokenLen} = yTokens;
  const maxLen = Math.min(xTokenLen, yTokenLen);
  for (let i = 0; i < maxLen; ++i) {
    // find floats not starting with '0', string or 0 if not defined
    const x_num = xNumeric[i];
    const y_num = yNumeric[i];
    const x_type = typeof x_num;
    const x_is_num = x_type === "number";
    const y_type = typeof y_num;
    const sameType = x_type === y_type;
    if (!sameType) {
      // Proper numbers go first.
      // We already checked sameType above, so we know only one is a number.
      return x_is_num ? -1 : 1;
    }

    // same type follows...
    if (x_is_num) {
      // both are numbers
      // Compare the numbers and if they are the same, the tokens too
      const res = default_compare(x_num, y_num) ||
          default_compare(xTokens[i], yTokens[i]);
      if (!res) {
        continue;
      }
      return res;
    }

    // both must be string-ey
    // Compare the actual tokens.
    const res = default_compare(xTokens[i], yTokens[i]);
    if (!res) {
      continue;
    }
    return res;
  }
  return default_compare(xTokenLen, yTokenLen);
}

/**
 * Natural Sort algorithm for es6, case-insensitive version
 * @param {*} a First term
 * @param {*} b Second term
 * @returns {Number} Comparison result
 */
function naturalCaseSort(a, b) {
  return naturalSort(`${a}`.toUpperCase(), `${b}`.toUpperCase());
}

/**
 * Array-enabled compare: If both operands are an array, compare individual
 * elements up to the length of the smaller array. If all elements match,
 * consider the array with fewer items smaller
 * @param {*} a First item to compare (either PoD or Array)
 * @param {*} b Second item to compare (either PoD or Array)
 * @param {cmp_fn} [cmp] Compare function or default_compare
 * @returns {number} Comparison result
 */
function array_compare(a, b, cmp) {
  cmp = cmp || default_compare;
  if (Array.isArray(a) && Array.isArray(b)) {
    const {length: a_len} = a;
    const {length: b_len} = b;
    const len = Math.min(a_len, b_len);
    for (let i = 0; i < len; ++i) {
      const rv = array_compare(a[i], b[i], cmp);
      if (rv) {
        return rv;
      }
    }
    return default_compare(a_len, b_len);
  }
  return cmp(a, b);
}

function mapped_compare(fn, a, b) {
  const {k: ka} = a;
  const {k: kb} = b;
  return array_compare(ka, kb, fn) || /* stable */ default_compare(a.i, b.i);
}

/**
 * Transform a given value into a key for sorting. Keys can be either PoDs or
 * an array of PoDs.
 * @callback key_fn
 * @param {*} item Array item to map
 * @returns {*} Key for sorting
 */

/**
 * Compare to items with each other, returning <0, 0, >0.
 * @callback cmp_fn
 * @param {*} item Array item to map
 * @returns {number} Comparison result
 */

/**
 * Sort an array by a given key function and comparison function.
 * This sort is stable, but and in-situ
 * @param {*[]} arr Array to be sorted
 * @param {key_fn} [key] How to make keys. If omitted, use value as key.
 * @param {cmp_fn} [cmp] How to compare keys. If omitted, use default cmp.
 * @returns {*[]} New sorted array
 */
function sort(arr, key, cmp) {
  cmp = cmp || default_compare;
  if (key) {
    arr.forEach((i, idx) => {
      arr[idx] = {i, k: key(i)};
    });
  }
  else {
    arr.forEach((i, idx) => {
      arr[idx] = {i, k: i};
    });
  }
  arr.sort(mapped_compare.bind(null, cmp));
  arr.forEach((i, idx) => {
    arr[idx] = i.i;
  });
  return arr;
}

/**
 * Sort an array by a given key function and comparison function.
 * This sort is stable, but NOT in-situ, it will rather leave the
 * original array untouched and return a sorted copy.
 * @param {*[]} arr Array to be sorted
 * @param {key_fn} [key] How to make keys. If omitted, use value as key.
 * @param {cmp_fn} [cmp] How to compare keys. If omitted, use default cmp.
 * @returns {*[]} New sorted array
 */
function sorted(arr, key, cmp) {
  cmp = cmp || default_compare;
  if (key) {
    arr = arr.map(i => {
      return {i, k: key(i)};
    });
  }
  else {
    arr = arr.map(i => {
      return {i, k: i};
    });
  }
  arr.sort(mapped_compare.bind(null, cmp));
  arr.forEach((i, idx) => {
    arr[idx] = i.i;
  });
  return arr;
}

module.exports = {
  default_compare,
  naturalSort,
  naturalCaseSort,
  sort,
  sorted,
};
