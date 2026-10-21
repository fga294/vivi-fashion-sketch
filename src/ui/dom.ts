type Attrs = Record<string, string | number | boolean | undefined>;
type Child = Node | string;

const SVG_NS = 'http://www.w3.org/2000/svg';

function setAttrs(el: Element, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    el.setAttribute(key, value === true ? '' : String(value));
  }
}

/** Create an HTML element with attributes and children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  el.append(...children);
  return el;
}

/** Create an SVG element with attributes and children. */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  setAttrs(el, attrs);
  el.append(...children);
  return el;
}

/** A decorative SVG made of plain paths, hidden from assistive tech. */
export function pathsSvg(viewBox: string, paths: readonly string[], className: string): SVGSVGElement {
  return s(
    'svg',
    { class: className, viewBox, 'aria-hidden': 'true', focusable: 'false' },
    ...paths.map((d) => s('path', { d })),
  );
}
