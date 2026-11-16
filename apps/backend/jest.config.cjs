module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", tsx: true, decorators: false },
          transform: { legacyDecorator: true },
          target: "es2022"
        },
        module: { type: "commonjs" }
      }
    ]
  },
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  setupFiles: ["<rootDir>/tests/load-test-env.cjs"],
  globalTeardown: "<rootDir>/tests/global-teardown.cjs",
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 30000,
  maxWorkers: 1,
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/server.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"]
};
