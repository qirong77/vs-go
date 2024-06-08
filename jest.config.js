module.exports = {
    testTimeout: 100000,
    preset: 'ts-jest/presets/js-with-ts',
    globals: {
      'ts-jest': {
        tsconfig: {
          target: 'esnext', // Increase test coverage.
          allowJs: true,
          sourceMap: true,
        },
      },
    },
  };
  