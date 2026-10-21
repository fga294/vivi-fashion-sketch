import { describe, expect, it } from 'vitest';
import tokensCss from '../../src/styles/tokens.css?raw';

// The palette table from PLAN.md, Look and feel.
const PLAN_PALETTE: Record<string, string> = {
  '--table': '#EBDDB0',
  '--tray-cream': '#F1E6C8',
  '--tray-shadow': '#D9CBA6',
  '--frame-taupe': '#B5A48E',
  '--frame-taupe-dark': '#8F7F6B',
  '--plate-blush': '#F4C9D3',
  '--plate-blush-line': '#E3A9B8',
  '--plate-rose': '#D9778F',
  '--plate-rose-line': '#B95870',
  '--paper': '#FBF8F1',
  '--crayon-wax': '#2F2A2E',
  '--ink-soft': '#6B5B5E',
};

function declaredTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens.set(m[1]!, m[2]!.toUpperCase());
  }
  return tokens;
}

describe('design tokens', () => {
  const tokens = declaredTokens(tokensCss);

  it.each(Object.entries(PLAN_PALETTE))('%s is %s', (name, hex) => {
    expect(tokens.get(name)).toBe(hex);
  });

  it('self-hosts Quicksand with no remote font URLs', () => {
    expect(tokensCss).toMatch(/font-family:\s*'Quicksand'/);
    expect(tokensCss).not.toMatch(/https?:\/\//);
  });
});
