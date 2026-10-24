export interface Pencil {
  readonly id: string;
  readonly name: string;
  readonly hex: string;
}

/** The 16 colouring pencils, in box order (PLAN.md, Colouring tools). */
export const PENCILS: readonly Pencil[] = [
  { id: 'cherry', name: 'Cherry red', hex: '#D2283C' },
  { id: 'tangerine', name: 'Tangerine', hex: '#F08A2C' },
  { id: 'sunflower', name: 'Sunflower', hex: '#F4C542' },
  { id: 'leaf', name: 'Leaf green', hex: '#4E9E47' },
  { id: 'mint', name: 'Mint', hex: '#8ED6B6' },
  { id: 'sky', name: 'Sky blue', hex: '#7CC4E6' },
  { id: 'cobalt', name: 'Cobalt', hex: '#2E55BE' },
  { id: 'violet', name: 'Violet', hex: '#8758BE' },
  { id: 'bubblegum', name: 'Bubblegum pink', hex: '#F296C0' },
  { id: 'chocolate', name: 'Chocolate brown', hex: '#6A4227' },
  { id: 'charcoal', name: 'Charcoal', hex: '#3A383B' },
  { id: 'gold', name: 'Gold', hex: '#C8A028' },
  { id: 'porcelain', name: 'Porcelain', hex: '#F5DAC8' },
  { id: 'honey', name: 'Honey', hex: '#E0B086' },
  { id: 'caramel', name: 'Caramel', hex: '#B4784C' },
  { id: 'espresso', name: 'Espresso', hex: '#583724' },
];

export type CrayonId = 'wax' | 'rose' | 'sky' | 'mint';

export interface Crayon {
  readonly id: CrayonId;
  readonly name: string;
  readonly hex: string;
}

/**
 * The four rubbing crayons (PLAN.md, Pattern plates). Deeper than their pencil
 * namesakes, so a grainy 3-unit line still reads on the paper (3 : 1 or more).
 */
export const CRAYONS: readonly Crayon[] = [
  { id: 'wax', name: 'Black', hex: '#2F2A2E' },
  { id: 'rose', name: 'Rose', hex: '#C2496B' },
  { id: 'sky', name: 'Sky blue', hex: '#3C80C2' },
  { id: 'mint', name: 'Mint', hex: '#2F937A' },
];

export function crayonById(id: CrayonId): Crayon {
  return CRAYONS.find((c) => c.id === id)!;
}
