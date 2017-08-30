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

const PROGRESS_SIZELEN = 13;
const PROGRESS_PERLEN = 6;
const PROGRESS_ELLEN = 5;
const PROGRESS_RATELEN = 8;
const PROGRESS_TIMEOUT = 200;
const PROGRESS_COLUMNS = 80;

class ProgressBar extends Rate {
  constructor(name, options) {
    options = options || {};
    const {
      stream = process.stdout,
      timeout = PROGRESS_TIMEOUT,
      total = 0,
      nameMax = 0,
    } = options;
    super();
    this.name = name;
    this.nameMax = nameMax;
    this.total = total;
    this.stream = stream;
    this.timeout = timeout;
    this.tty = stream.isTTY;
    this.start = new Date();
    this.current = 0;
    this.total = options.total || 0;
    this.terminated = false;
    this.last = new Date();
    Object.seal(this);
  }

  get progress() {
    return Math.max(Math.min(this.current * 100 / this.total, 100), 0);
  }

  static shorten(str, len) {
    if (str.length < len) {
      return str;
    }
    const thlen = (len - 1) / 2;
    const hlen = Math.floor(thlen);
    const hlen2 = thlen > hlen ? hlen + 1 : hlen;
    str = `${str.slice(0, hlen - 1)}…${str.slice(str.length - hlen2)}`;
    if (str !== len) {
      throw new Error(`wat ${len}/${hlen}/${hlen2}/${str.length}`);
    }
    return str;
  }

  update(current, total) {
    if (this.terminated) {
      return;
    }
    this.current = current;
    this.total = total;
    const now = new Date();
    if (this.last && now - this.last < this.timeout) {
      return;
    }
    this.last = now;
    let {columns} = process.stdout;
    columns = columns || PROGRESS_COLUMNS;
    columns -= 2;

    const {stream, progress} = this;
    current = filesize(current);
    total = filesize(total);
    const sizes = `${current}/${total}`.lpad(PROGRESS_SIZELEN);
    const percent = `${progress.toFixed(1)}%`.lpad(PROGRESS_PERLEN);
    const elapsed = `${this.elapsed.toFixed(1)}s`.lpad(PROGRESS_ELLEN);
    const rate = `${filesize(this.rate)}/s`.lpad(PROGRESS_RATELEN);
    if (!this.tty) {
      stream.write(`${this.name} ${percent} ${current}/${total} ${elapsed}\n`);
    }
    columns -= [sizes, percent, elapsed, rate].reduce((p, c) => {
      return c.length + 1 + p;
    }, 0);
    const chalf = Math.floor(columns / 2) - 1;
    let name = this.name.rpad(Math.min(this.nameMax, chalf));
    name = ProgressBar.shorten(name, chalf);
    columns -= name.length + 1;
    columns -= 2;
    const done = Math.floor(columns * progress / 100);
    const remain = Math.ceil(columns * (100 - progress) / 100);
    const barDone = "#".repeat(done);
    const barRemain = "-".repeat(remain);
    stream.write("\r");
    if (stream.clearLine) {
      stream.clearLine();
    }
    stream.write(`${name.bold} [${barDone.green}${barRemain.yellow}] ${percent.bold.green} ${sizes.bold.cyan} ${rate.bold.yellow} ${elapsed.bold.blue}`);
  }

  terminate(lastUpdate = true) {
    this.last = 0;
    if (lastUpdate) {
      this.update(this.total, this.total);
    }
    if (this.tty) {
      this.stream.write("\n");
    }
    this.terminated = true;
  }
}


module.exports = {
  filesize,
  Rate,
  ProgressBar,
};
