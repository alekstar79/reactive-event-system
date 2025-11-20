// eslint.config.js
import { defineConfig } from 'eslint-define-config'

import plugin from '@typescript-eslint/eslint-plugin'
import parser from '@typescript-eslint/parser'

export default defineConfig([
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': plugin,
    },
    rules: {
      //
    }
  }
])
