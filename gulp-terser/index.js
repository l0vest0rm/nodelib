const through = require('through2');
const PluginError = require('plugin-error');
const Terser = require('terser');
const applySourceMap = require('vinyl-sourcemaps-apply');

const PLUGIN_NAME = 'terser';
const DEFAULT_SUFFIX = '.min.js';

const TerserPlugin = (options = {}) => {
  const transform = async (file, _, callback) => {
    if (file.isNull()) {
      return callback(null, file);
    }

    if (file.isStream()) {
      const error = new PluginError(PLUGIN_NAME, 'Streams are not supported!');
      return callback(error);
    }

    const outputFile = file.clone();
    const code = outputFile.contents.toString();

    if (outputFile.path && options.suffix !== false) {
      if (typeof options.suffix === 'string') {
        outputFile.extname = options.suffix;
      } else {
        outputFile.extname = DEFAULT_SUFFIX;
      }
    }

    const terserOptions = options.terserOptions || {};
    if (outputFile.sourceMap) {
      terserOptions.sourceMap = { filename: outputFile.path };
    }

    try {
      const result = await Terser.minify(code, terserOptions);
      outputFile.contents = Buffer.from(result.code);

      if (outputFile.sourceMap && result.map) {
        applySourceMap(outputFile, result.map);
      }
    } catch (err) {
      return callback(err);
    }

    return callback(null, outputFile);
  };

  return through.obj(transform);
};

module.exports = TerserPlugin;
