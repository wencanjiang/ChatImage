"use strict";

process.env.CHATIMAGE_ALIGNMENT_AUDIT_STRICT = process.env.CHATIMAGE_ALIGNMENT_AUDIT_STRICT || "1";
process.env.CHATIMAGE_ALIGNMENT_AUDIT_MIN_SEMANTIC_RATIO =
  process.env.CHATIMAGE_ALIGNMENT_AUDIT_MIN_SEMANTIC_RATIO || "0.5";

require("./real-alignment-audit");
