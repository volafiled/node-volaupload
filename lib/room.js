"use strict";

require("colors");
const fs = require("fs");
const path = require("path");
const log = require("loglevel");
const {promisify} = require("util");
const {Room: VolaRoom} = require("volapi");
const {ProgressBar} = require("./progress");

const CONFIG = Symbol("config");

const DEFAULT_HIGHMARK_ORDER = 19;
const DEFAULT_HIGHMARK = 1 << DEFAULT_HIGHMARK_ORDER;

function makeSerial(cur, total) {
  total = `${total}`;
  return `[${cur.toString().lpad(total.length, "0")}/${total}] `;
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
  }

  async login() {
    const {passwd = null} = this[CONFIG];
    if (passwd) {
      log.info("Greenfagging in as".bold, this.nick.bold.green);
      await super.login(passwd);
    }
  }

  async upload(files, rate) {
    log.info("Connecting to".bold, "mainframe cluster".bold.yellow,
      this.url.bold.blue);
    await this.connect();

    const {"delete-after": deleteAfter = false} = this[CONFIG];

    let {prefix = null} = this[CONFIG];
    if (prefix) {
      prefix = prefix.trim();
    }
    files = files.map(file => {
      const {base} = path.parse(file);
      if (!base) {
        throw new Error("Not something I can upload");
      }
      if (prefix) {
        return {file, name: `${prefix} ${base}`};
      }
      return {file, name: base};
    });
    const nameMax = files.reduce((p, c) => Math.max(p, c.name.length), 0);
    const total = files.length;
    let cur = 0;
    for (const file of files) {
      if (this.aborted) {
        break;
      }
      try {
        const serial = total > 1 ? makeSerial(++cur, total) : "";
        await this.uploadFile(serial, file.name, file.file, rate, nameMax);
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
      }
      catch (ex) {
        log.error(
          "Failed to upload".bold.red,
          `${file.bold}:`,
          ex.message || ex);
      }
    }
    await this.close();
  }

  async uploadFile(serial, name, file, rate, nameMax) {
    const {block_size: highWaterMark = DEFAULT_HIGHMARK} = this[CONFIG];
    const stream = fs.createReadStream(file, {
      highWaterMark,
      encoding: null
    });
    const {size: total} = await promisify(fs.stat)(stream.path);
    const bar = new ProgressBar(serial, name, { total, nameMax });

    class UserAbort extends Error {}

    try {
      await super.uploadFile(name, {
        stream,
        progress: (delta, current, length) => {
          rate.current += delta;
          bar.update(current, length);
          if (this.aborted) {
            throw new UserAbort();
          }
        },
      });
    }
    catch (ex) {
      bar.terminate(false);
      if (ex instanceof UserAbort) {
        return;
      }
      throw ex;
    }

    bar.terminate();
  }

  close() {
    this.aborted = true;
    return super.close();
  }
}

module.exports = { Room };
