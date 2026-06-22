module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.eslint.json',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'test/'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    "@typescript-eslint/no-namespace": "off",
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/no-var-requires": "off",
    "no-restricted-imports": ["error", {
      "patterns": [
        {
          "group": ["../../*", "../../../*"],
          "message": "Use absolute imports with 'src/' prefix instead of relative parent imports that cross domain boundaries. Example: use 'src/user/entities/user.entity' instead of '../../user/entities/user.entity'. Same-module parent imports (../file) and same-directory imports (./file) are still allowed."
        }
      ]
    }]
  },
};