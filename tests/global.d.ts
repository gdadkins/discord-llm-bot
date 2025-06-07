// Global test utilities type declarations
declare global {
  var createMockFile: (filePath: string, content: any) => Promise<void>;
  var cleanupTestFiles: (testDir: string) => Promise<void>;
  var TEST_DATA_DIR: string;
  var TEST_CONFIG_DIR: string;
  var TEST_HEALTH_DIR: string;
  var TEST_ANALYTICS_DIR: string;
}

export {};