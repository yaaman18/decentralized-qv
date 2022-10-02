module.exports = {
  extends: [..."plugin:tailwindcss/recommended"],
  trailingComma: "all",
  tabWidth: 2,
  semi: false,
  singleQuote: true,
  jsxSingleQuote: true,
  printWidth: 100,
  plugins: [require("prettier-plugin-tailwindcss"), "tailwindcss"],
};
