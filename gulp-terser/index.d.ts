import { MinifyOptions } from 'terser'

interface PluginOptions {
  suffix?: string;
  terserOptions?: MinifyOptions
}

declare function terser(options?: PluginOptions): any;
export = terser;
