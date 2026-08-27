/**
 * Cosmetic-only pseudo-random placement for in-glyph traffic impacts.
 *
 * The seed is derived from authoritative identity, making one event look varied
 * without changing its route, count, state, or outcome. Replaying the same run
 * therefore produces the same placement rather than visual flicker.
 */

export interface ImpactSlotSeed {
  runId: string;
  componentId: string;
  sequence: number;
}

export function impactSlotSeed({ runId, componentId, sequence }: ImpactSlotSeed): string {
  return `${runId}:${componentId}:${sequence}`;
}

/** Returns every available slot exactly once in a seeded, visually varied order. */
export function randomizedImpactSlots(slotCount: number, seed: string): readonly number[] {
  if (!Number.isSafeInteger(slotCount) || slotCount < 0) {
    throw new Error("Impact slot count must be a non-negative safe integer.");
  }

  const slots = Array.from({ length: slotCount }, (_, index) => index);
  const next = seededUnitInterval(seed);

  for (let index = slots.length - 1; index > 0; index -= 1) {
    const target = Math.floor(next() * (index + 1));
    [slots[index], slots[target]] = [slots[target], slots[index]];
  }

  return slots;
}

function seededUnitInterval(seed: string): () => number {
  let state = hashSeed(seed) || 0x6d2b79f5;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}
