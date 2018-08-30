"use strict";

require("colors");
const fs = require("fs");
const path = require("path");
const log = require("loglevel");
const {promisify} = require("util");
const {Room: VolaRoom} = require("volapi");
const {util: {sleep}} = require("volapi");
const {ProgressBar} = require("./progress");
const {randint, shuffle} = require("./util");

class UserAbort extends Error {}

const CONFIG = Symbol("config");

const DEFAULT_HIGHMARK_ORDER = 19;
const DEFAULT_HIGHMARK = 1 << DEFAULT_HIGHMARK_ORDER;
const SPAMEXTS = new Set([".jpg", ".jpe", ".jpeg", ".png", ".gif"]);

const fsStat = promisify(fs.stat);

function readGreeks(file) {
  return new Promise((resolve, reject) => {
    try {
      const readline = require("readline");

      const input = fs.createReadStream(file);
      const rl = readline.createInterface({
        input,
        crlfDelay: Infinity
      });

      const rv = new Set();
      rl.on("line", line => {
        line = line.trim();
        if (!line) {
          return;
        }
        rv.add(line);
      });
      rl.on("close", () => {
        log.info(`${rv.size} spam names loaded`);
        resolve(shuffle(Array.from(rv)));
      });
      rl.on("error", reject);
      input.on("error", reject);
    }
    catch (ex) {
      reject(ex);
    }
  });
}


function makeSerial(cur, total) {
  total = `${total}`;
  return `[${cur.toString().lpad(total.length, "0")}/${total}] `;
}

function randomChan(ext) {
  const id = randint(1089711161349, 16897111613);
  return `${id}${ext}`;
}

function randomImg(ext) {
  const id = randint(1000, 9999);
  return `IMG_${id}${ext}`;
}

function randomDSC(ext) {
  const id = randint(1000, 9999);
  return `DSC_${id}${ext}`;
}

function randomImage(ext) {
  const id = randint(1, 999);
  return `image (${id})${ext}`;
}

const SPAMFNS = [randomChan, randomImg, randomDSC, randomImage];

function makeSpamName(ext) {
  return shuffle(SPAMFNS)[0](ext);
}

class Room extends VolaRoom {
  constructor(roomid, config, other) {
    config = config || {};
    const {user = null} = config;
    if (!user) {
      throw new Error("Invalid user");
    }
    super(roomid, user, other);
    this[CONFIG] = config;
    this.aborted = false;
    this.on("upload_timeout", to => {
      log.warn("Have to wait for".yellow, `${(to / 1000).toFixed(1)}s`.bold);
    });
  }

  async login() {
    const {passwd = null, spam = null} = this[CONFIG];
    if (passwd && !spam) {
      log.info("Greenfagging in as".bold, this.nick.bold.green);
      await super.login(passwd);
    }
  }

  async checkUpload(fid, expected) {
    const file = await this.waitFile(fid, 20000);
    if (!file) {
      console.warn("Failed to check checksum; no file");
      return;
    }
    const {checksum} = await file.infos();
    if (!checksum) {
      console.warn("Failed to check checksum; no sum");
      return;
    }
    if (checksum !== expected) {
      throw new Error(`Checksums mismatch: ${expected}/${checksum}`);
    }
  }

  async upload(files, rate) {
    log.info("Connecting to".bold, "mainframe cluster".bold.yellow,
      this.url.bold.blue);
    await this.connect();

    let {prefix = null} = this[CONFIG];
    let {spam = null} = this[CONFIG];
    if (prefix) {
      prefix = prefix.trim();
    }
    files = files.map(file => {
      const {base, ext} = path.parse(file);
      if (!base) {
        throw new Error("Not something I can upload");
      }
      const lext = ext.toLowerCase();
      if (spam && SPAMEXTS.has(lext)) {
        return {file, name: makeSpamName(lext)};
      }
      if (prefix) {
        return {file, name: `${prefix} ${base}`};
      }
      return {file, name: base};
    });
    const nameMax = files.reduce((p, c) => Math.max(p, c.name.length), 0);
    const total = files.length;
    let cur = 0;
    if (spam) {
      spam = await readGreeks(spam);
    }
    for (const file of files) {
      if (this.aborted) {
        break;
      }
      while (spam && spam.length) {
        try {
          const nn = spam.pop();
          this.changeNick(nn);
          spam.unshift(nn);
          break;
        }
        catch (ex) {
          continue;
        }
      }
      const serial = total > 1 ? makeSerial(++cur, total) : "";
      await this.uploadFile(serial, file.name, file.file, rate, nameMax);
    }
    await this.close();
  }

  async uploadFile(serial, name, file, rate, nameMax) {
    const {"delete-after": deleteAfter = false} = this[CONFIG];
    const {block_size: highWaterMark = DEFAULT_HIGHMARK} = this[CONFIG];
    const {attempts = 5, check = false} = this[CONFIG];
    const cAttempts = Math.max(1, Math.min(10, attempts));

    const {size: total} = await fsStat(file);

    for (let attempt = 0; attempt < cAttempts; ++attempt) {
      if (attempt) {
        await sleep(attempt * 500);
      }
      const stream = fs.createReadStream(file, {
        highWaterMark,
        encoding: null
      });
      let _bar;
      const bar = () => {
        if (!_bar) {
          _bar = new ProgressBar(serial, name, { total, nameMax });
        }
        return _bar;
      };

      try {
        const res = await super.uploadFile({
          name,
          stream,
          progress: (delta, current, length, server) => {
            rate.current += delta;
            bar().update(current, length, server);
            if (this.aborted) {
              throw new UserAbort();
            }
          },
        });
        bar();
        _bar.update(_bar.total, _bar.total);
        if (!res) {
          continue;
        }
        const {id: fid, checksum: expected} = res;
        if (check && fid) {
          await this.checkUpload(fid, expected);
        }
        if (deleteAfter) {
          try {
            fs.unlinkSync(file);
          }
          catch (iex) {
            log.error(
              "Failed remove file".bold.red,
              `${file.bold}:`,
              iex.message || iex);
          }
        }
        break;
      }
      catch (ex) {
        if (ex instanceof UserAbort) {
          return;
        }
        if (_bar) {
          _bar.terminate();
        }
        log.error(
          "Failed to upload".bold.red,
          `${file.bold}:`,
          ex.message || ex,
          `(Attempt ${attempt + 1})`);
      }
      finally {
        try {
          stream.close();
        }
        catch (ex) {
          // ignored
        }
        bar().terminate();
      }
    }
  }

  close() {
    this.aborted = true;
    return super.close();
  }
}

module.exports = { Room };
