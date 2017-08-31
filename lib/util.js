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
const ULEN = UNITS.length;
const FS_CUTOFF = 900;
const FS_USIZE = 1024;
const FS_100_FIXED = 1;
const FS_FIXED = 2;
const FS_PLACES = 5;

function filesize(size, places = FS_PLACES) {
  const neg = size < 0 ? "-" : "";
  size = Math.abs(size);
  let u = 0;
  while (size > FS_CUTOFF && u + 1 < ULEN) {
    size /= FS_USIZE;
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

module.exports = {
  filesize,
  Rate,
};
