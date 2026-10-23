// Browser globals are explicit so undefined variables in app screens fail CI.
// Includes Node globals used by *.test.mjs.
export default [
 {
  files: ["finance/**/*.{js,mjs}"],
  languageOptions: {
   ecmaVersion: "latest",
   sourceType: "module",
   globals: {
    window: "readonly",document: "readonly",navigator: "readonly",
    location: "readonly",console: "readonly",fetch: "readonly",
    crypto: "readonly",CustomEvent: "readonly",Option: "readonly",
    FormData: "readonly",TextEncoder: "readonly",TextDecoder: "readonly",
    Blob: "readonly",URL: "readonly",URLSearchParams: "readonly",
    setTimeout: "readonly",clearTimeout: "readonly",confirm: "readonly",
    alert: "readonly",performance: "readonly",localStorage: "readonly",
    requestAnimationFrame: "readonly",FileReader: "readonly",Event: "readonly",
    process: "readonly",Buffer: "readonly"
   }
  },
  rules: { "no-undef": "error", "no-unreachable": "error",
   "no-constant-condition": "error" }
 }
];
