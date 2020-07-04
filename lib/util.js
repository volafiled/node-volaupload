"use strict";

Object.defineProperty(String.prototype, "lpad", {
  value(pad, char = " ") {
    const {length} = this;
    if (!pad || length >= pad) {
      return this;
    }
    return char.repeat(pad - length) + this;
  },
  configurable: true,
  writable: true,
});

Object.defineProperty(String.prototype, "rpad", {
  value(pad, char = " ") {
    const {length} = this;
    if (!pad || length >= pad) {
      return this;
    }
    return this + char.repeat(pad - length);
  },
  configurable: true,
  writable: true,
});

const UNITS = Object.freeze(["B", "K", "M", "G", "T", "P", "E", "Z"]);
const U_LEN = UNITS.length;
const FS_CUTOFF = 900;
const FS_U_SIZE = 1024;
const FS_100_FIXED = 1;
const FS_FIXED = 2;
const FS_PLACES = 5;

function filesize(size, places = FS_PLACES) {
  const neg = size < 0 ? "-" : "";
  size = Math.abs(size);
  let u = 0;
  while (size > FS_CUTOFF && u + 1 < U_LEN) {
    size /= FS_U_SIZE;
    u++;
  }
  if (u) {
    if (size >= 100) {
      size = size.toFixed(FS_100_FIXED);
    }
    else {
      size = size.toFixed(FS_FIXED);
    }
  }
  else {
    size = size.toFixed(0);
  }
  const result = `${neg}${size}${UNITS[u]}`;
  return result.lpad(places);
}

class Rate {
  constructor() {
    this.start = new Date();
    this.current = 0;
  }

  get elapsed() {
    return (new Date() - this.start) / 1000;
  }

  get rate() {
    return this.current / this.elapsed;
  }
}

function randint(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}

function shuffle(array) {
  for (let i = array.length; i; i--) {
    const j = Math.floor(Math.random() * i);
    [array[i - 1], array[j]] = [array[j], array[i - 1]];
  }
  return array;
}

module.exports = {
  randint,
  shuffle,
  filesize,
  Rate,
};
