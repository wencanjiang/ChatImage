"use strict";

const { runAgentEvaluation } = require("./agent-evaluation-runner");

async function main() {
  const report = await runAgentEvaluation({
    provider: "mock",
    failOnThreshold: true,
    artifactDir: "tmp/agent-evaluation-test"
  });
  if (report.skipped) {
    console.log(`agent-evaluation.test.js skipped: ${report.reason}`);
    return;
  }
  console.log("agent-evaluation.test.js passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
