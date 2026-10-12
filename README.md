# AdminForth i18n Static Plugin

<img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /> <a href="https://www.npmjs.com/package/@adminforth/i18n-static"><img src="https://img.shields.io/npm/dm/@adminforth/i18n-static" alt="npm downloads" /></a> <a href="https://www.npmjs.com/package/@adminforth/i18n-static"><img src="https://img.shields.io/npm/v/@adminforth/i18n-static" alt="npm version" /></a>

[![Ask AI](https://tluma.ai/badge)](https://tluma.ai/ask-ai/devforth/adminforth)

Translates the AdminForth admin panel using plain JSON files, one per language. No database resource is needed.
You keep the translations in git next to your code and edit them by hand or with a coding agent.

## Features

- One flat `<language code>.json` file per language, e.g. `langs/uk.json`: `{ "Save": "Зберегти" }`.
- A CLI command finds all translation keys in the admin SPA sources and adds them to every language file, without building the SPA.
- Edits are applied after a page reload. No restart is needed.
- Untranslated strings (empty values) fall back to the original English text.
- Adds a language selector to the login page and the user menu.
- Supports ISO 639-1 codes and BCP-47 tags with a region (e.g. `pt-BR`), plus pluralization, Slavic forms included.
- Ships an agent skill that teaches coding agents to fill in missing translations.
- Stops app start with a clear error if a language file is not valid JSON or a plural translation would break the page, and warns about plural translations with a wrong number of forms.

## Quick start

```bash
pnpm add @adminforth/i18n-static
```

Register it as a global plugin:

```ts
import I18nStaticPlugin from '@adminforth/i18n-static';

export const admin = new AdminForth({
  ...
  globalPlugins: [
    new I18nStaticPlugin({
      supportedLanguages: ['en', 'uk', 'de', 'pt-BR'],
      // translationsDir: 'langs', // default
    }),
  ],
});
```

Create or update the language files:

```bash
pnpm exec adminforth-i18n-static sync
```

The command prints the `total`, `added`, `stale` and `untranslated` key counts for every file. It also copies the
translation skill into `.agents/skills`, so you can ask your coding agent to "translate the admin panel".

## Documentation

Full setup and configuration guide:

[AdminForth i18n Static Documentation](https://adminforth.dev/docs/tutorial/Plugins/i18n-static/)

If you want to edit translations from the admin panel itself and translate them with an LLM, use
[@adminforth/i18n](https://adminforth.dev/docs/tutorial/Plugins/i18n/) instead.

## About AdminForth

AdminForth is an open-source, agent-first admin framework for building robust admin panels and back-office applications faster.

## Related links

- [AdminForth website](https://adminforth.dev)
- [npm package](https://www.npmjs.com/package/@adminforth/i18n-static)
- [More AdminForth plugins](https://adminforth.dev/docs/tutorial/ListOfPlugins/)
- [Built by DevForth](https://devforth.io)
