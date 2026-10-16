import { describe, expect, it } from 'vitest';
import { createGenerationOrder } from './traversal';

describe('createGenerationOrder', () => {
  it('traverses root to canopy by default', () => {
    expect(createGenerationOrder(6, false)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('reverses traversal from canopy to root', () => {
    const forward = createGenerationOrder(6, false);
    const reverse = createGenerationOrder(6, true);

    expect(reverse).toEqual([5, 4, 3, 2, 1, 0]);
    expect(forward).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
