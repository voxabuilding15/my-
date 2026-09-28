export type DetectedLanguage = {
  language: string | null;
  tsConfig: 'english' | 'french' | 'arabic' | 'simple';
};

const ARABIC = /[؀-ۿ]/g;
const LETTERS = /\p{L}/gu;
const FRENCH = new Set([
  'le',
  'la',
  'les',
  'des',
  'est',
  'une',
  'et',
  'du',
  'que',
  'dans',
  'pour',
  'pas',
  'sur',
  'au',
  'avec',
  'sont',
  'qui',
  'ce',
  'il',
  'nous',
]);
const ENGLISH = new Set([
  'the',
  'and',
  'is',
  'of',
  'to',
  'in',
  'that',
  'it',
  'for',
  'are',
  'with',
  'as',
  'was',
  'on',
  'this',
  'be',
  'by',
  'or',
  'from',
  'which',
]);

/** Picks the Postgres text-search configuration (stemming) for the document's main language. */
export function detectLanguage(text: string): DetectedLanguage {
  const sample = text.slice(0, 20_000);
  const letters = sample.match(LETTERS)?.length ?? 0;
  if (letters === 0) return { language: null, tsConfig: 'simple' };
  if ((sample.match(ARABIC)?.length ?? 0) / letters > 0.3)
    return { language: 'ar', tsConfig: 'arabic' };

  let french = 0;
  let english = 0;
  for (const word of sample.toLowerCase().split(/[^\p{L}']+/u)) {
    if (FRENCH.has(word)) french++;
    else if (ENGLISH.has(word)) english++;
  }
  if (french + english < 5) return { language: null, tsConfig: 'simple' };
  return french > english
    ? { language: 'fr', tsConfig: 'french' }
    : { language: 'en', tsConfig: 'english' };
}
