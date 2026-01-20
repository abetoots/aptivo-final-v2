export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // customize as needed
    "scope-enum": [2, "always", ["web", "config", "shared", "ci", "docs"]],
    "scope-empty": [1, "never"], // warn if no scope (not error)
    "body-max-line-length": [2, "always", 200], // [level, applicable, value]
  },
};
