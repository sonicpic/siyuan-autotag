const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const ZipPlugin = require("zip-webpack-plugin");

module.exports = (_, argv) => {
  const isProduction = argv.mode === "production";
  const entryName = isProduction ? "dist/index" : "index";
  const assetPatterns = isProduction
    ? [
        { from: "plugin.json", to: "dist/plugin.json" },
        { from: "README.md", to: "dist/README.md" },
        { from: "README_zh_CN.md", to: "dist/README_zh_CN.md" },
        { from: "LICENSE", to: "dist/LICENSE", toType: "file", noErrorOnMissing: true },
        { from: "icon.png", to: "dist/icon.png", noErrorOnMissing: true },
        { from: "preview.png", to: "dist/preview.png", noErrorOnMissing: true },
        { from: "src/i18n", to: "dist/i18n" },
      ]
    : [
        { from: "src/i18n", to: "i18n" },
      ];

  return {
    mode: isProduction ? "production" : "development",
    target: "web",
    watch: !isProduction,
    entry: {
      [entryName]: "./src/index.ts",
    },
    output: {
      path: path.resolve(__dirname),
      filename: "[name].js",
      library: {
        type: "commonjs2",
      },
      clean: false,
    },
    devtool: isProduction ? false : "source-map",
    externals: {
      siyuan: "commonjs siyuan",
    },
    resolve: {
      extensions: [".ts", ".js"],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          loader: "esbuild-loader",
          options: {
            loader: "ts",
            target: "es2020",
          },
        },
        {
          test: /\.s?css$/,
          use: [
            MiniCssExtractPlugin.loader,
            "css-loader",
            "sass-loader",
          ],
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: isProduction ? "dist/index.css" : "index.css",
      }),
      new CopyWebpackPlugin({
        patterns: assetPatterns,
      }),
      ...(isProduction
        ? [
            new ZipPlugin({
              filename: "package.zip",
              include: [/^dist[\\/]/],
              pathMapper: (assetPath) => assetPath.replace(/^dist[\\/]/, ""),
            }),
          ]
        : []),
    ],
  };
};
