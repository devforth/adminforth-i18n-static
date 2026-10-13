import { I18nBase, PLURAL_SEPARATOR, SLAVIC_PLURAL_FORMS, SLAVIC_PLURAL_FORMS_HINT, SOURCE_LANGUAGE, requiresSlavicPlurals } from "@adminforth/i18n";
import { afLogger } from "adminforth";
import type { AdminForthConfigMenuItem, IAdminForth } from "adminforth";
import fs from "fs";
import type { SimpleFile } from "vue-i18n-extract";
import path from "path";
import type { LanguageSyncStats, PluginOptions } from "./types.js";

const DEFAULT_TRANSLATIONS_DIR = 'langs';
// same files AdminForth scans with `i18n:extract` when bundling SPA
const SOURCE_FILE_RE = /\.(js|vue|ts)$/;
const NODE_MODULES_DIR = 'node_modules';
const TEMPLATE_LITERAL_QUOTE = '`';

// config texts are optional, missing ones are skipped
function isText(text: string | undefined): text is string {
  return Boolean(text);
}

// every plural rule picks from at least 2 forms, so a single form breaks rendering
const MIN_RENDERABLE_PLURAL_FORMS = 2;

function countPluralForms(text: string): number {
  return text.split(PLURAL_SEPARATOR).length;
}

// translated plural strings: key has forms separated by `|` and value is not empty
function translatedPlurals(messages: Record<string, string>): [string, string][] {
  return Object.entries(messages).filter(([key, value]) => value && key.includes(PLURAL_SEPARATOR));
}

function expectedPluralForms(lang: string, key: string): number {
  return requiresSlavicPlurals(lang) ? SLAVIC_PLURAL_FORMS : countPluralForms(key);
}

function describePluralMismatch(lang: string, key: string, value: string): string {
  const hint = requiresSlavicPlurals(lang) ? ` (${SLAVIC_PLURAL_FORMS_HINT})` : ' like in the key';
  return `"${key}": "${value}" — expected ${expectedPluralForms(lang, key)} forms${hint}, found ${countPluralForms(value)}`;
}

// language files are edited by hand or by agents, so they are validated as external input
function parseLanguageFile(filePath: string, lang: string, content: string): Record<string, string> {
  let messages: unknown;
  try {
    messages = JSON.parse(content);
  } catch (e) {
    throw new Error(`Translations file ${filePath} is not valid JSON: ${(e as Error).message}`);
  }
  if (typeof messages !== 'object' || messages === null || Array.isArray(messages)
    || Object.values(messages).some((value) => typeof value !== 'string')) {
    throw new Error(`Translations file ${filePath} should be a flat JSON object with string values, e.g. { "Save": "Зберегти" }`);
  }
  const unrenderable = translatedPlurals(messages as Record<string, string>)
    .filter(([, value]) => countPluralForms(value) < MIN_RENDERABLE_PLURAL_FORMS)
    .map(([key, value]) => `  ${describePluralMismatch(lang, key, value)}`);
  if (unrenderable.length) {
    // vue-i18n throws while rendering when plural rule picks a form which does not exist
    throw new Error(`Translations file ${filePath} has plural translations which break the page when rendered:\n${unrenderable.join('\n')}`);
  }
  return messages as Record<string, string>;
}

// wrong number of forms does not break rendering, but some numbers are shown with wrong word form
function findWrongPlurals(lang: string, messages: Record<string, string>): string[] {
  return translatedPlurals(messages)
    .filter(([key, value]) => countPluralForms(value) !== expectedPluralForms(lang, key))
    .map(([key, value]) => describePluralMismatch(lang, key, value));
}

export default class I18nStaticPlugin extends I18nBase<PluginOptions> {
  pluginsScope: 'global' = 'global';
  translationsDir: string;
  // parsed language files by path, re-read only when file changes: backend translates every menu item on each request
  languageFilesCache = new Map<string, { mtimeMs: number, messages: Record<string, string> }>();

  constructor(options: PluginOptions) {
    super(options);
    this.translationsDir = path.resolve(options.translationsDir ?? DEFAULT_TRANSLATIONS_DIR);
  }

  modifyGlobalConfig(adminforth: IAdminForth) {
    super.modifyGlobalConfig(adminforth);
    this.validateLanguageFiles();
    this.injectLanguageSelectors(adminforth);

    // backend strings (menu labels, etc.) are translated from the same language files, category is not used
    this.installBackendTranslator(adminforth, async (msg, category, lang) => (await this.readLanguageFile(lang))?.[msg]);
  }

  // fails app start on broken language file instead of failing every frontend_messages request later, only warns about wrong plural forms
  validateLanguageFiles() {
    for (const lang of this.options.supportedLanguages) {
      const filePath = this.languageFilePath(lang);
      if (fs.existsSync(filePath)) {
        const wrongPlurals = findWrongPlurals(lang, parseLanguageFile(filePath, lang, fs.readFileSync(filePath, 'utf-8')));
        if (wrongPlurals.length) {
          afLogger.warn(`Translations file ${filePath} has wrong number of plural forms, some numbers will be shown with wrong word form:\n  ${wrongPlurals.join('\n  ')}`);
        }
      }
    }
  }

  languageFilePath(lang: string): string {
    return path.join(this.translationsDir, `${lang}.json`);
  }

  // file changes are picked up on next read, so manual edits are visible without restart
  async readLanguageFile(lang: string): Promise<Record<string, string> | null> {
    const filePath = this.languageFilePath(lang);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const { mtimeMs } = await fs.promises.stat(filePath);
    const cached = this.languageFilesCache.get(filePath);
    if (cached?.mtimeMs === mtimeMs) {
      return cached.messages;
    }
    const messages = parseLanguageFile(filePath, lang, await fs.promises.readFile(filePath, 'utf-8'));
    this.languageFilesCache.set(filePath, { mtimeMs, messages });
    return messages;
  }

  async getCategoryTranslations(category: string, lang: string): Promise<Record<string, string>> {
    return this.fallbackToOriginal(await this.readLanguageFile(this.resolveLanguage(lang)) ?? {});
  }

  /**
   * Folders which AdminForth bundler puts into SPA sources: core SPA, custom folders of plugins
   * and user's custom components
   */
  spaSourceDirs(): string[] {
    const { codeInjector, config } = this.adminforth;
    const dirs = [path.join(codeInjector.getSpaDir(), 'src'), ...Object.keys(codeInjector.srcFoldersToSync)];
    if (config.customization.customComponentsDir) {
      dirs.push(path.resolve(config.customization.customComponentsDir));
    }
    return [...new Set(dirs)];
  }

  async readSourceFiles(dir: string): Promise<SimpleFile[]> {
    const relativePaths = await fs.promises.readdir(dir, { recursive: true });
    const filePaths = relativePaths
      .filter((relativePath) => SOURCE_FILE_RE.test(relativePath) && !relativePath.split(path.sep).includes(NODE_MODULES_DIR))
      .map((relativePath) => path.join(dir, relativePath));
    return Promise.all(filePaths.map(async (filePath) => ({
      fileName: filePath,
      path: filePath,
      content: await fs.promises.readFile(filePath, 'utf-8'),
    })));
  }

  // collects `$t(...)` keys from SPA sources the same way as AdminForth bundler does, without building SPA
  async sourceKeys(): Promise<string[]> {
    // imported lazily: on import vue-i18n-extract installs process-wide handlers which exit on any uncaught error
    const { extractI18NItemsFromVueFiles } = await import('vue-i18n-extract');
    const files = (await Promise.all(this.spaSourceDirs().map((dir) => this.readSourceFiles(dir)))).flat();
    // same rule as vue-i18n-extract report: `${...}` template literals produce a different key every time, so they are skipped
    const staticItems = extractI18NItemsFromVueFiles(files).filter((item) => !(
      item.path.includes('${') && item.previousCharacter === TEMPLATE_LITERAL_QUOTE && item.nextCharacter === TEMPLATE_LITERAL_QUOTE
    ));
    return staticItems.map((item) => item.path);
  }

  // all strings shown in admin: frontend `$t(...)` keys and config texts translated by backend
  async extractKeys(): Promise<string[]> {
    return [...new Set([...await this.sourceKeys(), ...this.menuKeys(), ...this.resourceKeys()])];
  }

  // menu and settings pages labels which AdminForth backend translates with adminforth.tr, labels set by functions are known only per request
  menuKeys(): string[] {
    const collect = (items: AdminForthConfigMenuItem[]): (string | undefined)[] => items.flatMap((item) => [
      typeof item.label === 'string' ? item.label : undefined,
      item.badgeTooltip,
      ...collect(item.children ?? []),
    ]);
    const settingsPages = this.adminforth.config.auth!.userMenuSettingsPages ?? [];
    return [...collect(this.adminforth.config.menu), ...settingsPages.map((page) => page.pageLabel)].filter(isText);
  }

  // resource texts which AdminForth backend translates with adminforth.tr: labels, column headers, enums, validation messages,
  // form notes, bulk actions and field groups
  resourceKeys(): string[] {
    const keys: (string | undefined)[] = [];
    for (const resource of this.adminforth.config.resources) {
      keys.push(resource.label);
      for (const column of resource.columns) {
        keys.push(column.label, column.editingNote?.create, column.editingNote?.edit, column.foreignResource?.unsetLabel);
        keys.push(...(column.enum ?? []).map((item) => item.label));
        keys.push(...(column.validation ?? []).map((rule) => rule.message));
      }
      for (const action of resource.options.bulkActions ?? []) {
        keys.push(action.label);
        keys.push(...(typeof action.confirm === 'string' ? [action.confirm] : Object.values(action.confirm ?? {})));
      }
      keys.push(...(resource.options.fieldGroups ?? []).map((group) => group.groupName));
    }
    return keys.filter(isText);
  }

  /**
   * Adds keys found in sources to every language file (creating missing files), keeps existing keys
   * and their order, appends new keys with empty value. Keys which are not in sources anymore are only reported.
   * Source language file gets keys as values, so it is complete right away and English texts can be rephrased in it.
   */
  async syncKeys(): Promise<LanguageSyncStats[]> {
    const keys = await this.extractKeys();
    const keysSet = new Set(keys);
    await fs.promises.mkdir(this.translationsDir, { recursive: true });

    const languages: LanguageSyncStats[] = [];
    for (const lang of this.options.supportedLanguages) {
      const existing = await this.readLanguageFile(lang);
      const created = !existing;
      // copy: read result is cached, it must not get keys before the file is written
      const messages = { ...existing };

      const added = keys.filter((key) => !Object.hasOwn(messages, key));
      for (const key of added) {
        messages[key] = '';
      }
      const filled = lang === SOURCE_LANGUAGE ? Object.keys(messages).filter((key) => messages[key] === '') : [];
      for (const key of filled) {
        messages[key] = key;
      }
      const stale = Object.keys(messages).filter((key) => !keysSet.has(key)).length;
      const untranslated = Object.values(messages).filter((value) => value === '').length;

      const filePath = this.languageFilePath(lang);
      if (created || added.length || filled.length) {
        // write to temp file and rename: running app and interrupted sync never see a partially written file
        const tmpPath = `${filePath}.tmp`;
        await fs.promises.writeFile(tmpPath, `${JSON.stringify(messages, null, 2)}\n`);
        await fs.promises.rename(tmpPath, filePath);
      }
      languages.push({
        lang, file: filePath, created, total: Object.keys(messages).length, added: added.length, stale, untranslated,
        wrongPlurals: findWrongPlurals(lang, messages),
      });
    }

    return languages;
  }
}
