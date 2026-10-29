import { describe, expect, it } from 'vitest';
import { negotiate } from './config';
import { headLead, makeI18n, type Messages } from './core';

describe('negotiate', () => {
  it('picks the best supported language', () => {
    expect(negotiate('sv-SE,sv;q=0.9,en;q=0.8')).toBe('sv');
    expect(negotiate('ru')).toBe('ru');
    expect(negotiate('pt-BR,fi;q=0.5')).toBe('fi');
    expect(negotiate(null)).toBe('en');
  });

  it('sends Norwegian "no" and "nn" to Bokmål', () => {
    expect(negotiate('no')).toBe('nb');
    expect(negotiate('nn-NO,en;q=0.5')).toBe('nb');
  });
});

describe('tn', () => {
  const msgs = (m: Record<string, string>) => m as unknown as Messages;

  it('uses Russian one, few and many forms', () => {
    const { tn } = makeI18n('ru', msgs({ 'x.one': '{n} фото', 'x.few': '{n} фотографии', 'x.many': '{n} фотографий', 'x.other': '{n} фотографии' }));
    expect(tn('x', 1)).toBe('1 фото');
    expect(tn('x', 21)).toBe('21 фото');
    expect(tn('x', 3)).toBe('3 фотографии');
    expect(tn('x', 5)).toBe('5 фотографий');
    expect(tn('x', 11)).toBe('11 фотографий');
    expect(tn('x', 0)).toBe('0 фотографий');
  });

  it('falls back to other when a form is missing', () => {
    const { tn } = makeI18n('en', msgs({ 'x.one': 'one photo', 'x.other': '{n} photos' }));
    expect(tn('x', 1)).toBe('one photo');
    expect(tn('x', 0)).toBe('0 photos');
    expect(tn('x', 4)).toBe('4 photos');
  });
});

describe('headLead', () => {
  it('joins a hyphenated first half into one word with a soft hyphen', () => {
    expect(headLead('Rom-') + 'vær').toBe('Rom\u00ADvær');
  });
  it('adds a space otherwise', () => {
    expect(headLead('Space') + 'weather').toBe('Space weather');
  });
});
