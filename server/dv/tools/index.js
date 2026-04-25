/**
 * dv/tools/index.js — side-effect loader.
 *
 * Requiring this module pulls in every tool category file, each of which
 * calls dv.defineTool() at module-load time to register its tools. Order
 * doesn't matter — the registry is a flat Map, and duplicates throw.
 */

"use strict";

require("./browse");
require("./interact");
require("./visual");
require("./state");
require("./audit");
require("./network");
require("./deploy");
require("./content");
require("./ai");
require("./pages");
require("./engine");
require("./aggregate");
require("./devtools");
require("./codec");
require("./sandbox");
require("./live");
require("./workflow");
