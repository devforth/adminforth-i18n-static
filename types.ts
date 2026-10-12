import type { I18nBaseOptions } from "@adminforth/i18n";

export interface PluginOptions extends I18nBaseOptions {
  /**
   * Directory with translation files, one `<language code>.json` per language (e.g. `uk.json`).
   * Relative paths are resolved from the current working directory. Created by the `sync` command if missing.
   * Defaults to `langs`.
   */
  translationsDir?: string;
}

export interface LanguageSyncStats {
  lang: string;
  file: string;
  created: boolean;
  // all keys in file, including stale ones
  total: number;
  added: number;
  stale: number;
  // keys with empty value (stale ones included), shown as original key until translated
  untranslated: number;
  // plural translations with wrong number of forms, described as `"key": "value" — expected N forms, found M`
  wrongPlurals: string[];
}
