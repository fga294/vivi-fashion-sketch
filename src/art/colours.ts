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
