import { configureLocalization } from '@lit/localize';

import { sourceLocale, targetLocales } from './locales/locale-codes.js';

type Localization = {
  getLocale: () => string;
  setLocale: (locale: string) => Promise<void>;
};

/**
 * lit-localize can be configured once per copy of the library. A bundled
 * plugin has a copy of its own. When the page shares one copy with the host
 * and the host configured it first, the translations of this plugin cannot
 * be installed and the interface stays in English.
 */
function configure(): Localization | undefined {
  try {
    return configureLocalization({
      sourceLocale,
      targetLocales,
      loadLocale: (locale: string) => {
        switch (locale) {
          case 'de':
            return import('./locales/de.js');
          case 'pt':
            return import('./locales/pt.js');
          default:
            return Promise.reject(new Error(`No translation for ${locale}`));
        }
      }
    });
  } catch {
    return undefined;
  }
}

const localization = configure();

export const getLocale = (): string => localization?.getLocale() ?? sourceLocale;


/** The language, such as `de` for `de-AT`, or the source language when there is no translation. */
export function supportedLocale(locale: string | undefined): string {
  const language = (locale ?? '').toLowerCase().split(/[-_]/)[0];
  return (targetLocales as readonly string[]).includes(language)
    ? language
    : sourceLocale;
}

/** Shows the interface in the language of `locale`, as near as there is a translation. */
export async function useLocale(locale: string | undefined): Promise<void> {
  await localization?.setLocale(supportedLocale(locale));
}
