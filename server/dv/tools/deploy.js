/**
 * dv/tools/deploy.js — re-export shim (R4).
 *
 * The original 763-LOC monolith was split into focused modules:
 *   - deploy-basic.js        list_previews / build_status / trigger_build /
 *                            get_build_log / deploy_and_verify / run_test
 *   - deploy-history.js      deployment_history / rollback / bisect_builds /
 *                            compare_deployments / read_deployed_file /
 *                            annotate_deployment
 *   - deploy-diagnostics.js  analyze_build_failure / commit_changelog /
 *                            deploy_repo
 *
 * Tools are registered via side effects of require(), so this shim's
 * job is just to pull in all 3 split files in order. The dv/tools/index.js
 * loader continues to require this file and expects the 15 tools to be
 * registered when control returns.
 */

"use strict";

require("./deploy-basic");
require("./deploy-history");
require("./deploy-diagnostics");
