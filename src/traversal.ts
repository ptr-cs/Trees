export function createGenerationOrder(count: number, reverse: boolean): number[] {
  const safeCount = Math.max(0, Math.trunc(count));
  const order = Array.from({ length: safeCount }, (_value, generation) => generation);

  return reverse ? order.reverse() : order;
}
