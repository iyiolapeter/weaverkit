module.exports = {
    parser: '@typescript-eslint/parser',  // Specifies ESLint parser
    extends: [
      'plugin:@typescript-eslint/recommended',
      'plugin:prettier/recommended',
      'prettier/@typescript-eslint',
    ],
    plugins: ['@typescript-eslint', 'prettier'],
    parserOptions: {
      ecmaVersion: 2019,  // Allows parsing of modern ECMA features
      sourceType: 'module',  // Allows for the use of imports
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'prettier/prettier': [
        'error',
        {
          semi: true,
          trailingComma: 'all',
          singleQuote: false,
          printWidth: 140,
          tabWidth: 4,
          useTabs: true
        }]
    },
  };