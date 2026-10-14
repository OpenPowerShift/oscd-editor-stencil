import { msg } from '@lit/localize';

/**
 * The editing functions explain what is wrong with an English sentence.
 * This gives the same sentence in the language of the user.
 */
const texts: Record<string, () => string> = {
  'Category and name are needed': () => msg('Category and name are needed'),
  'An application with this category and name exists': () =>
    msg('An application with this category and name exists'),
  'A version is needed': () => msg('A version is needed'),
  'This version exists': () => msg('This version exists'),
  'A function name is needed': () => msg('A function name is needed'),
  'A function with this name exists': () =>
    msg('A function with this name exists'),
  'Function names must be different': () =>
    msg('Function names must be different')
};

export function problemText(problem: string): string {
  return texts[problem]?.() ?? problem;
}
