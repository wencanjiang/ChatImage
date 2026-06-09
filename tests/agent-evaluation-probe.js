"use strict";

const path = require("path");
const { runAgentEvaluation } = require("./agent-evaluation-runner");

async function main() {
  const provider = process.env.CHATIMAGE_AGENT_EVAL_PROVIDER || "api";
  const report = await runAgentEvaluation({
    provider,
    failOnThreshold: false,
    includeRealOnly: true,
    artifactDir: path.join(process.cwd(), "tmp", "agent-evaluation")
  });
  if (report.skipped) {
    console.log(`agent-evaluation-probe.js skipped: ${report.reason}`);
    return;
  }
  console.log(`Agent evaluation report saved to tmp/agent-evaluation`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
