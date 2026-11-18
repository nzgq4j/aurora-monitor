import { describe, expect, it } from 'vitest';
import { SKY_CAMERAS, cameraById, maxAgeFor, registryProblems, type SkyCamera } from './skycams';

const kiruna = cameraById('irf-kiruna')!;
const fixture = (over: Partial<SkyCamera>): SkyCamera => ({ ...kiruna, id: 'fixture', ...over });

describe('sky camera registry', () => {
  it('ships with no problems', () => {
    expect(registryProblems(SKY_CAMERAS)).toEqual([]);
  });

  it('only cleared cameras have images shown; every camera has a source page', () => {
    for (const c of SKY_CAMERAS) {
      expect(c.sourcePageUrl).toMatch(/^https?:\/\//);
      if (c.license.status === 'cleared') expect(c.imageUrl).toMatch(/^https:\/\//);
    }
    expect(SKY_CAMERAS.filter(c => c.license.status === 'cleared').map(c => c.id)).toEqual(['irf-kiruna']);
  });

  it('no camera has social permission yet', () => {
    expect(SKY_CAMERAS.every(c => c.socialPermission.status !== 'granted')).toBe(true);
  });

  it('flags a cleared camera without credit or licence', () => {
    const bad = fixture({ credit: { text: ' ', url: '' }, license: { ...kiruna.license, licenseUrl: null } });
    expect(registryProblems([bad])).toEqual([
      'fixture: cleared without credit text',
      'fixture: cleared without a credit link',
      'fixture: cleared without a licence URL',
    ]);
  });

  it('flags a cleared camera without an HTTPS image', () => {
    expect(registryProblems([fixture({ imageUrl: null })])).toEqual(['fixture: cleared without an image URL']);
    expect(registryProblems([fixture({ imageUrl: 'http://example.org/a.jpg' })])).toEqual(['fixture: cleared image is not HTTPS']);
  });

  it('flags granted social permission without evidence, and duplicate ids', () => {
    expect(registryProblems([fixture({ socialPermission: { status: 'granted', grantedBy: 'X' } })]))
      .toEqual(['fixture: social permission granted without grantedBy, grantedOn and evidence']);
    expect(registryProblems([kiruna, kiruna])).toEqual(['irf-kiruna: duplicate id']);
  });

  it('max image age is five cadences and at least ten minutes', () => {
    expect(maxAgeFor(60)).toBe(600);
    expect(maxAgeFor(300)).toBe(1500);
    expect(maxAgeFor(null)).toBe(600);
  });
});
