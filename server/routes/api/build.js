// ── Build sub-router shim (R2) ───────────────────────────────────────────────
// The original 380-LOC monolith was split into focused sub-routers:
//   - build-core.js            — trigger / cancel / stop / status / log /
//                                SSE log + status streams / thumbnails
//   - webhooks-in.js           — incoming GitHub push + pull_request handler
//   - history-routes.js        — history / rollback / note / tag / comments
//   - webhooks-out.js          — outgoing webhook subscriber CRUD + test
//   - artifact.js              — build-artifact ZIP download
//   - preview-errors-route.js  — runtime-error collection (public, no auth)
//
// This shim mounts all six so the parent index can keep doing
//   app.use("/api", require("./routes/api/build"))
// without churn.

"use strict";

const express = require("express");
const router = express.Router();

router.use("/", require("./build-core"));
router.use("/", require("./webhooks-in"));
router.use("/", require("./history-routes"));
router.use("/", require("./webhooks-out"));
router.use("/", require("./artifact"));
router.use("/", require("./preview-errors-route"));

module.exports = router;
