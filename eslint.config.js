import eslintPluginSvelte from 'eslint-plugin-svelte';

export default [
  // Ignores
  {
    ignores: [
      'dist/',
      '.vite/',
      'node_modules/',
      '.commandcode/',
      'packages/'
    ]
  },
  // Javascript settings
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        navigator: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        AbortController: 'readonly',
        FileReader: 'readonly',
        crypto: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      'no-undef': 'error'
    }
  },
  // Svelte settings
  ...eslintPluginSvelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    rules: {
      'svelte/valid-compile': ['error', { ignoreWarnings: true }]
    }
  }
];
