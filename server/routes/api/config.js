// ── Config sub-router shim (R1) ──────────────────────────────────────────────
// The original 700-LOC monolith was split into focused sub-routers:
//   - identity.js   — token / secrets / preferences
//   - github.js     — GitHub fetching (repos / branches / readme / detect)
//   - repos.js      — repos & branches CRUD
//   - env-groups.js — reusable env-var bundles
//   - domains.js    — custom-domain mapping
//   - workspace.js  — workspace cleanup + config export/import
//
// This shim mounts all five so the parent index can continue to do
//   app.use("/api", require("./routes/api/config"))
// without churn — and existing callers keep working.

"use strict";

const express = require("express");
const router = express.Router();

router.use("/", require("./identity"));
router.use("/", require("./github"));
router.use("/", require("./repos"));
router.use("/", require("./env-groups"));
router.use("/", require("./domains"));
router.use("/", require("./workspace"));

module.exports = router;
