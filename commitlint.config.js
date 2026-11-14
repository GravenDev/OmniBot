// Conventional commits, plus one rule of our own: a subject says what the
// commit changes, never the work step that produced it, since each one
// becomes a changelog line (lint/commit-subject.js).
import { subjectDescribesChange } from "./lint/commit-subject.js";

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [{ rules: { "subject-describes-change": subjectDescribesChange } }],
  rules: { "subject-describes-change": [2, "always"] },
};
