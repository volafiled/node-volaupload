#!/usr/bin/env node
"use strict";

console.debug = console.log;

require("colors");
const fs = require("fs");
const path = require("path");
const ini = require("ini");
const minimist = require("minimist");
const log = require("loglevel");

require("./lib/wangblows");
const {Room} = require("./lib/room");
const {sorted, naturalCaseSort} = require("./lib/sorting");


function print_help() {
  log.info("node", process.argv[1].green,
    "--room".yellow, "BEEPi".red,
    "--user".yellow, "volaupload".red,
    "[FILES]".bold.green);
  const options = {
    "-r, --room": "Room to which to upload files",
    "-u, --user": "User name to use",
    "-p, --passwd": "Login to vola for some sweet stats",
    "-s, --sort": "Method by which file to order before uploading",
    "--version": "Print version and exit",
  };
  const args = Object.keys(options);
  const sk = k => k.replace(/-/g, "");
  args.sort((a, b) => sk(a) > sk(b));
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
  return `${base}\xff///\xff${dir}`;
}

function sort_path(file) {
  const {base, dir} = path.parse(file);
  return `${dir}\xff///\xff${base}`;
}

function sort_size(file) {
  return `${fs.statSync(file).size}\xff///\xff${sort_filename(file)}`;
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
  let config = ini.parse(fs.readFileSync(iniPath, {encoding: "utf-8"}));
  const {vola = {}, aliases = {}} = config;

  args = minimist(args, {
    boolean: ["help", "h", "v", "delete-after"],
    alias: {
      h: "help",
      p: "passwd",
      r: "room",
      s: "sort",
      u: "user",
    },
    default: {
      sort: "filename",
    }
  });
  if (args.help) {
    print_help();
    return;
  }
  if (args.version) {
    log.info(require("./package.json").version);
    process.exit(0);
  }
  let {_: files} = args;
  delete args._;
  if (!files.length) {
    throw new Error("No files specified");
  }
  let {room: roomid} = args;
  if ("user" in args && args.user) {
    delete vola.passwd;
  }
  if (!roomid) {
    throw new Error("No room specified");
  }
  delete args.room;
  if (roomid.toLowerCase() in aliases) {
    roomid = aliases[roomid] || roomid;
  }
  config = Object.assign({}, vola, args);
  const sortfn = SORTS.get(config.sort);
  if (!sortfn) {
    throw new Error("Invalid --sort");
  }
  files = sorted(files.map(f => path.resolve(f)), sortfn, naturalCaseSort);
  const room = new Room(roomid, config);
  const cancel = () => {
    log.warn("\r\nCancel requested".bold.yellow);
    room.close();
  };
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  process.on("SIGQUIT", cancel);
  await room.upload(files);
}

if (require.main === module) {
  log.setDefaultLevel(log.levels.INFO);
  main(process.argv.slice(2)).catch(ex => {
    log.error("Error".red, ex.message || ex);
    process.exit(1);
  }).then(rv => {
    process.exit(rv || 0);
  });
}
