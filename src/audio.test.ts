import { describe, expect, it } from 'vitest';
import { TREE_RELEASE_SECONDS, sustainedGenerationGain } from './audio';

describe('sustainedGenerationGain', () => {
  it('decreases monotonically as the tree climbs', () => {
    const gains = Array.from({ length: 26 }, (_, generation) =>
      sustainedGenerationGain(generation));

    expect(gains[0]).toBe(1);
    expect(gains.at(-1)).toBeGreaterThan(0);

    for (let index = 1; index < gains.length; index += 1) {
      expect(gains[index]).toBeLessThan(gains[index - 1] ?? Number.NEGATIVE_INFINITY);
    }
  });


  it('uses a deliberately long final tree release', () => {
    expect(TREE_RELEASE_SECONDS).toBeGreaterThanOrEqual(3);
  });
});
