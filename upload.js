#!/usr/bin/env node
"use strict";

console.debug = console.log;

require("colors");
const fs = require("fs");
const path = require("path");
const ini = require("ini");
const minimist = require("minimist");
const log = require("loglevel");
const glob = require("glob");

require("./lib/wangblows");
const {Room} = require("./lib/room");
const {sort, naturalCaseSort} = require("./lib/sorting");
const {filesize, Rate} = require("./lib/util");

const BLACKED = /^thumbs.*\.db$|^\.ds_store$/i;

const normalize = (function() {
if (process.platform === "win32") {
  return file => file.replace(/\\/g, "/");
}
return file => file;
})();

class UsageError extends Error {}

function *collect_files(infiles, recursive) {
  for (let file of infiles) {
    file = normalize(file);
    try {
      const {base} = path.parse(file);
      if (BLACKED.test(base)) {
        log.warn("Ignored", `${file.yellow}:`, "You must be a roboCOP".bold);
        continue;
      }
      const stat = fs.statSync(file);
      if (recursive && stat.isDirectory()) {
        yield *collect_files(
          fs.readdirSync(file).map(e => path.resolve(file, e)),
          recursive);
        continue;
      }
      if (!stat.isFile()) {
        log.warn("Ignored", `${file.yellow}:`, "Not a file".bold);
        continue;
      }
      yield file;
    }
    catch (ex) {
      console.log(ex);
      try {
        const globbed = glob.sync(file);
        if (!globbed.length) {
          throw new UsageError("No files matched");
        }
        yield *collect_files(globbed, recursive);
      }
      catch (ex) {
        log.warn("Ignored", `${file.yellow}:`, ex.message || ex);
      }
    }
  }
}


function printUsage() {
  const {base: exe} = path.parse(process.argv[1]);
  log.info(exe.bold.green,
    "--room".yellow, "BEEPi".cyan,
    "--user".yellow, "volaupload".cyan,
    "[FILES]".bold.yellow);
  const options = {
    "-r, --room": "Room(s) to which to upload files",
    "-t, --attempts": "Number of upload attempts per file",
    "-a, --roompasswd": "Room password",
    "-u, --user": "User name to use",
    "-p, --passwd": "Login to vola for some sweet stats",
    "-s, --sort": "Method by which file to order before uploading " +
      "[filename*, path, size, none]",
    "-R, --retarddir": "Specify directories and upload all files within",
    "-c, --check": "Check files were uploaded correctly",
    "--delete-after": "Remove file after uploading",
    "--version": "Print version and exit",
    "--prefix": "Add a prefix to all uploads",
    "-h, --help": "Take a wild guess",
  };
  const args = Object.keys(options);
  const sk = k => k.replace(/-/g, "");
  sort(args, sk, naturalCaseSort);
  const max = args.reduce((p, c) => Math.max(c.length, p), 0);
  log.info("");
  for (const a of args) {
    log.info(" ", a.yellow, " ".repeat(max - a.length + 2), options[a].bold);
  }
  log.info("");
  log.info("Additionally, ~/.vola.conf will be considered".magenta.bold);
}

function sort_filename(file) {
  const {base, dir} = path.parse(file);
  return [base, dir];
}

function sort_path(file) {
  const {base, dir} = path.parse(file);
  return [dir, base];
}

function sort_size(file) {
  return [fs.statSync(file).size, sort_filename(file)];
}

const SORTS = Object.freeze(new Map([
  ["filename", sort_filename],
  ["path", sort_path],
  ["size", sort_size],
]));

async function main(args) {
  const home = process.env[
    (process.platform === "win32") ? "USERPROFILE" : "HOME"];
  const iniPath = path.resolve(home, ".vola.conf");
  let config = {};
  try {
    config = ini.parse(fs.readFileSync(iniPath, {encoding: "utf-8"}));
  }
  catch (ex) {
    log.warn("Make a", ".vola.conf".yellow, "already, pls");
  }
  const {vola = {}, aliases = {}, roompasswords = {}} = config;

  args = minimist(args, {
    boolean: ["help", "h", "v", "delete-after", "retarddir", "check"],
    alias: {
      a: "roompasswd",
      c: "check",
      h: "help",
      p: "passwd",
      r: "room",
      R: "retarddir",
      s: "sort",
      t: "attempts",
      u: "user",
    },
    default: {
      sort: "filename",
      attempts: 5,
    }
  });
  if (args.help) {
    printUsage();
    return;
  }
  if (args.version) {
    log.info(require("./package.json").version);
    process.exit(0);
  }
  let {_: files} = args;
  delete args._;
  let {room: roomids} = args;
  if ("user" in args && args.user) {
    delete vola.passwd;
  }
  if (!roomids) {
    throw new UsageError("No room specified");
  }
  if (!Array.isArray(roomids)) {
    roomids = [roomids];
  }
  delete args.room;
  config = Object.assign({}, vola, args);
  files = Array.from(collect_files(files, config.retarddir));
  if (!files.length) {
    throw new UsageError("No files specified");
  }
  if (config.sort !== "none") {
    const sortfn = SORTS.get(config.sort);
    if (!sortfn) {
      throw new UsageError("Invalid --sort");
    }
    files = sort(files.map(f => path.resolve(f)), sortfn, naturalCaseSort);
  }
  if (!isFinite(config.attempts) || config.attempts < 0) {
    throw new UsageError("Invalid number of attempts");
  }

  let lastRoom = null;
  const rate = new Rate();
  const tlen = files.length === 1 ? "one" : files.length.toString();
  log.info(
    "Deploying".bold,
    tlen.bold.green,
    `botnet payload${tlen === "one" ? "" : "s"}`.bold.yellow,
    "to", roomids.length.toString().bold.magenta, "rooms");

  let canceled = false;
  const cancel = () => {
    if (canceled) {
      return;
    }
    log.warn("\r\nCancel requested".bold.yellow);
    canceled = true;
    lastRoom.close();
  };
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  process.on("SIGQUIT", cancel);

  for (;;) {
    let roomid = roomids.shift();
    if (!roomid || canceled) {
      break;
    }
    if (roomid.toLowerCase() in aliases) {
      roomid = aliases[roomid] || roomid;
    }
    const thisconfig = Object.assign({}, config);
    if (roomids.length) {
      thisconfig["delete-after"] = false;
    }
    const room = new Room(roomid, thisconfig, lastRoom);
    if (config.roompasswd) {
      room.password = config.roompasswd;
    }
    else if (room.id in roompasswords) {
      room.password = roompasswords[room.id];
    }
    if (!lastRoom) {
      await room.login();
    }
    lastRoom = room;
    await room.upload(files, rate);
  }
  log.info(
    "All done in",
    `${rate.elapsed.toFixed(1)}s`.bold,
    `(${`${filesize(rate.rate)}/s`.cyan.blue})`);
}

if (require.main === module) {
  log.setDefaultLevel(log.levels.INFO);
  main(process.argv.slice(2)).catch(ex => {
    log.error("Error".red, ex.message || ex);
    if (ex instanceof UsageError) {
      log.info("");
      printUsage();
    }
    process.exit(1);
  }).then(rv => {
    process.exit(rv || 0);
  });
}
