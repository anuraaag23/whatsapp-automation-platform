module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  // Unit tests don't share a real DB/Redis (everything is a hand-rolled
  // Prisma/queue mock — see the *.spec.ts files themselves), so this isn't
  // fixing a resource race between suites the way maxWorkers:1 was needed
  // for e2e (see test/jest-e2e.json). It addresses a different, narrower
  // problem: "A worker process has failed to exit gracefully and has been
  // force exited" is Jest's own jest-worker child-process pool failing to
  // tear down cleanly — a known source of flakiness on Windows with
  // ts-jest, unrelated to anything the application does. Running unit
  // tests in-process instead of across multiple child workers removes that
  // failure mode entirely; with ~100 fast, mock-only tests the parallelism
  // wasn't buying meaningful wall-clock time anyway.
  maxWorkers: 1,
};
