import { I18nManager } from 'react-native';

import { resources, syncLayoutDirection } from '../index';

function flatten(value: object, prefix = ''): [key: string, text: string][] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'string'
      ? [[`${prefix}${key}`, child] as [string, string]]
      : flatten(child as object, `${prefix}${key}.`),
  );
}

const keysOf = (value: object) =>
  flatten(value)
    .map(([key]) => key)
    .sort();

describe('translations', () => {
  it.each(['ar', 'fr'] as const)('%s has exactly the English keys', (locale) => {
    expect(keysOf(resources[locale].translation)).toEqual(keysOf(resources.en.translation));
  });

  it.each(['en', 'ar', 'fr'] as const)('%s has no blank strings', (locale) => {
    const blank = flatten(resources[locale].translation).filter(([, text]) => text.trim() === '');
    expect(blank).toEqual([]);
  });
});

describe('syncLayoutDirection', () => {
  afterEach(() => jest.restoreAllMocks());

  it('requests a restart only when the direction changes', () => {
    const forceRTL = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
    jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => {});
    Object.defineProperty(I18nManager, 'isRTL', { value: false, configurable: true });

    expect(syncLayoutDirection('en')).toBe(false);
    expect(forceRTL).not.toHaveBeenCalled();

    expect(syncLayoutDirection('ar')).toBe(true);
    expect(forceRTL).toHaveBeenCalledWith(true);
  });
});
