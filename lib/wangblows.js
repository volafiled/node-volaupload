"use strict";

if (process.platform === "win32") {
  // kek, windows
  require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
  }).on("SIGINT", function() {
    process.emit("SIGINT");
  });
}
