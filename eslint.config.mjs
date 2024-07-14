import globals from "globals"
import pluginJs from "@eslint/js"

export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs"
    }
  },
  {
    languageOptions: {
      globals: globals.node
    }
  },
  {
    rules: {
      ...pluginJs.configs.recommended.rules,
      'no-unused-vars': false,
    }
  },
]
