import { describe, expect, it } from 'vitest';
import { parseArticle, plainText, search, slugify } from './supportText';

describe('parseArticle', () => {
  it('reads front matter and the body', () => {
    const { meta, body } = parseArticle('﻿---\r\ntitle: Why: a question\r\nsummary: "Quoted"\r\norder: 20\r\n---\r\nBody text\r\n');
    expect(meta).toEqual({ title: 'Why: a question', summary: 'Quoted', order: '20' });
    expect(body).toBe('Body text\n');
  });
  it('treats a file without front matter as all body', () => expect(parseArticle('Just text').meta).toEqual({}));
});

describe('slugify', () => {
  it('makes anchors from any alphabet', () => {
    expect(slugify('Paid by card (on the website)')).toBe('paid-by-card-on-the-website');
    expect(slugify('Météo spatiale')).toBe('meteo-spatiale');
    expect(slugify('Оплата картой')).toBe('оплата-картой');
  });
});

describe('plainText', () => {
  it('strips tags and decodes entities', () => expect(plainText('<p>Kp &amp; <b>Bz</b></p>')).toBe('Kp & Bz'));
});

describe('search', () => {
  const entries = [
    { title: 'How do I cancel Chaser?', summary: 'Card or Google Play.', text: 'Manage billing' },
    { title: 'Why are Sun images old?', summary: 'Each spacecraft publishes on its own schedule.', text: 'SDO, SOHO and Chaser' },
  ];
  it('needs every word and ranks title matches first', () => {
    expect(search(entries, 'chaser').map(e => e.title)).toEqual(['How do I cancel Chaser?', 'Why are Sun images old?']);
    expect(search(entries, 'cancel sdo')).toEqual([]);
  });
  it('ignores accents and case', () => expect(search([{ title: 'Météo', summary: '', text: '' }], 'METEO')).toHaveLength(1));
});
