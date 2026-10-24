// Pattern plates and the rubbing engine: the active plate's tile goes to the
// crayon, and "Stay inside" learns which lines are on the sheet.

import { patternTile } from '../engine/pattern.ts';
import type { FigurePlate, Game } from '../state.ts';
import type { PaperView } from './paper.ts';

export function connectPatterns(game: Game, paper: PaperView): void {
  const { rub, sheet } = paper;
  const stay = paper.stayInside; // switched on and off by the settings
  const tiles = new Map<string, HTMLCanvasElement>();

  /** Rasterise the walls once things are quiet, so the first pattern stroke doesn't wait. */
  const warm = (): void => {
    window.setTimeout(() => {
      if (game.pattern && game.phase === 'paperDown' && stay.enabled) stay.prepare();
    }, 0);
  };

  game.bus.on('pattern:change', ({ plate }) => {
    if (!plate) {
      rub.setPattern(null);
      return;
    }
    let tile = tiles.get(plate.id);
    if (!tile) tiles.set(plate.id, (tile = patternTile(plate, sheet.scale)));
    rub.setPattern(tile);
    warm();
  });

  // The walls are the lines on this sheet: the plates under it now, plus plates
  // rubbed under earlier placements (lift, swap, lay back).
  let earlier: FigurePlate[] = [];
  game.bus.on('paper:lay', () => {
    const current = Object.values(game.slots);
    const ids = new Set(current.map((p) => p.id));
    stay.setLines([...earlier.filter((p) => !ids.has(p.id)), ...current].map((p) => p.outlines));
  });
  game.bus.on('paper:clack', warm);
  game.bus.on('paper:lift', () => {
    for (const band of rub.armed) {
      const plate = game.slots[band];
      if (plate && rub.progress(band) > 0 && !earlier.some((p) => p.id === plate.id)) earlier.push(plate);
    }
  });
  game.bus.on('paper:new', () => {
    earlier = [];
  });
}
