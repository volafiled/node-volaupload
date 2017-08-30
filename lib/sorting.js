"use strict";

const re = /(^([+-]?(?:0|[1-9]\d*)(?:\.\d*)?(?:[eE][+-]?\d+)?)?$|^0x[0-9a-f]+$|\d+)/gi;
const sre = /(^[ ]*|[ ]*$)/g;
const dre = /(^([\w ]+,?[\w ]+)?[\w ]+,?[\w ]+\d+:\d+(:\d+)?[\w ]?|^\d{1,4}[/-]\d{1,4}[/-]\d{1,4}|^\w+, \w+ \d+, \d{4})/;
const hre = /^0x[0-9a-f]+$/i;
const ore = /^0/;
const zere = /^\0|\0$/g;

/**
 * Natural Sort algorithm for Javascript
 * Version 0.7 - Released under MIT license
 * Author: Jim Palmer (based on chunking idea from Dave Koelle)
 *
 * @param {*} a First term
 * @param {*} b Second term
 * @returns {Number} Comparison result
 */
function naturalSort (a, b) {
  const x = `${a}`.replace(sre, "") || "";
  const y = `${b}`.replace(sre, "") || "";
  // chunk/tokenize
  const xN = x.replace(re, "\0$1\0").replace(zere, "").split("\0");
  const yN = y.replace(re, "\0$1\0").replace(zere, "").split("\0");
  // numeric, hex or date detection
  const xD = parseInt(x.match(hre), 16) ||
    (xN.length !== 1 && x.match(dre) && Date.parse(x));
  const yD = parseInt(y.match(hre), 16) ||
    xD && y.match(dre) && Date.parse(y) || null;
  let oFxNcL;
  let oFyNcL;
  // first try and sort Hex codes or Dates
  if (yD) {
    if (xD < yD) {
      return -1;
    }
    else if (xD > yD) {
      return 1;
    }
  }
  // natural sorting through split numeric strings and default strings
  const numS = Math.max(xN.length, yN.length);
  for (let cLoc = 0; cLoc < numS; cLoc++) {
    // find floats not starting with '0', string or 0 if not defined
    oFxNcL = !(xN[cLoc] || "").match(ore) &&
      parseFloat(xN[cLoc]) || xN[cLoc] || 0;
    oFyNcL = !(yN[cLoc] || "").match(ore) &&
      parseFloat(yN[cLoc]) || yN[cLoc] || 0;
    // handle numeric vs string comparison - number < string - (Kyle Adams)
    if (isNaN(oFxNcL) !== isNaN(oFyNcL)) {
      return (isNaN(oFxNcL)) ? 1 : -1;
    }
    // rely on string comparison if different types
    // i.e. '02' < 2 != '02' < '2'
    else if (typeof oFxNcL !== typeof oFyNcL) {
      oFxNcL += "";
      oFyNcL += "";
    }
    if (oFxNcL < oFyNcL) {
      return -1;
    }
    if (oFxNcL > oFyNcL) {
      return 1;
    }
  }
  return 0;
}

function naturalCaseSort(a, b) {
  return naturalSort(`${a}`.toLowerCase(), `${b}`.toLowerCase());
}

function default_compare(a, b) {
  return a < b ? -1 : (a > b ? 1 : 0);
}

function mapped_compare(fn, a, b) {
  return fn(a.k, b.k);
}

function sorted(arr, keyfn, cmpfn) {
  cmpfn = cmpfn || default_compare;
  if (keyfn) {
    arr = arr.map(i => {
      return {i, k: keyfn(i)};
    });
  }
  else {
    arr = arr.map(i => {
      return {i, k: i};
    });
  }
  arr.sort(mapped_compare.bind(null, cmpfn));
  return arr.map(i => i.i);
}

module.exports = {
  naturalSort,
  naturalCaseSort,
  sorted
};
