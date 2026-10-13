#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { styleText } from "util";
import { tsImport } from "tsx/esm/api";
import type { IAdminForth } from "adminforth";
import type I18nStaticPlugin from "./index.js";
import type { LanguageSyncStats } from "./types.js";

// same convention as adminforth CLI: admin instance is exported from a .ts file in current directory
const ADMIN_EXPORT = 'export const admin';
const PREFERRED_ADMIN_FILE = 'index.ts';
// .env.local first: process.loadEnvFile does not override already set variables
const ENV_FILES = ['.env.local', '.env'];
// skills shipped with the plugin (copied to dist on build) and where coding agents look for project skills
const PLUGIN_SKILLS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'skills');
const PROJECT_SKILLS_DIR = path.join('.agents', 'skills');

function findAdminFile(): string {
  const files = fs.readdirSync(process.cwd()).filter((file) => file.endsWith('.ts'));
  files.sort((a, b) => Number(b === PREFERRED_ADMIN_FILE) - Number(a === PREFERRED_ADMIN_FILE));
  const file = files.find((f) => fs.readFileSync(f, 'utf-8').includes(ADMIN_EXPORT));
  if (!file) {
    throw new Error(`No .ts file in ${process.cwd()} exports admin instance, expected "${ADMIN_EXPORT} = new AdminForth({...})"`);
  }
  return path.resolve(file);
}

async function loadPlugin(): Promise<I18nStaticPlugin> {
  for (const envFile of ENV_FILES.filter((file) => fs.existsSync(file))) {
    process.loadEnvFile(envFile);
  }
  const { admin }: { admin: IAdminForth } = await tsImport(pathToFileURL(findAdminFile()).href, import.meta.url);
  return admin.getPluginByClassName<I18nStaticPlugin>('I18nStaticPlugin');
}

// styleText drops colors itself when output is not a terminal or NO_COLOR is set
function formatStats({ file, created, total, added, stale, untranslated, wrongPlurals }: LanguageSyncStats, nameWidth: number): string {
  const name = path.relative(process.cwd(), file).padEnd(nameWidth);
  return [
    `${created ? '✨' : '📄'} ${styleText('bold', name)}`,
    ...(created ? [styleText('cyan', 'created')] : []),
    `${total} total`,
    styleText(added ? 'green' : 'gray', `+${added} added`),
    stale ? styleText('yellow', `⚠ ${stale} stale`) : styleText('gray', '0 stale'),
    untranslated ? styleText('red', `${untranslated} untranslated`) : styleText('green', '✔ all translated'),
    ...(wrongPlurals.length ? [styleText('yellow', `⚠ ${wrongPlurals.length} wrong plural`)] : []),
  ].join('  ');
}

// copies missing plugin skill files into the project, existing files are kept because developer might have edited them
function installSkills(): string[] {
  const installed: string[] = [];
  const skillFiles = fs.readdirSync(PLUGIN_SKILLS_DIR, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
  for (const entry of skillFiles) {
    const source = path.join(entry.parentPath, entry.name);
    const target = path.join(PROJECT_SKILLS_DIR, path.relative(PLUGIN_SKILLS_DIR, source));
    if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      installed.push(target);
    }
  }
  return installed;
}

async function sync() {
  const plugin = await loadPlugin();
  console.log('🌐 Extracting translation keys...');
  const languages = await plugin.syncKeys();

  const nameWidth = Math.max(...languages.map(({ file }) => path.relative(process.cwd(), file).length));
  for (const stats of languages) {
    console.log(formatStats(stats, nameWidth));
    for (const wrongPlural of stats.wrongPlurals) {
      console.log(styleText('yellow', `    ${wrongPlural}`));
    }
  }

  for (const skillFile of installSkills()) {
    console.log(`🤖 ${styleText('cyan', 'created')} agent skill ${styleText('bold', skillFile)}`);
  }
}

const COMMANDS: Record<string, () => Promise<void>> = { sync };

const command = COMMANDS[process.argv[2]];
if (!command) {
  console.log(`Usage: adminforth-i18n-static <${Object.keys(COMMANDS).join('|')}>`);
  process.exit(1);
}
await command();
// admin instance keeps connections and timers open, they are not needed after command is done
process.exit(0);
