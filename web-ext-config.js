module.exports = {
  // Global options:
  verbose: true,
  sourceDir: './',
  
  // Command options:
  build: {
    overwriteDest: true,
  },
  
  run: {
    firefox: 'firefox',
    browserConsole: true,
    startUrl: ['about:debugging#/runtime/this-firefox'],
    pref: [],
  },
  
  // Files to ignore when building the extension
  ignoreFiles: [
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'node_modules',
    '.git',
    '.github',
    'scripts',
    'web-ext-artifacts',
    '.gitignore',
    'README.md',
    'EXTENSION_DEVELOPMENT.md',
    'web-ext-config.js',
    'venv',
    '*.py',
    '*.sh',
    '*.bat',
    'ARCHITECTURE.md',
    '.env*',
  ],
};