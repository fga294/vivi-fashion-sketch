// A minimal XML reader for plate SVG files. Plates are small, hand-authored and
// restricted (see PLAN.md, SVG authoring rules), so a strict tag/attribute
// tokenizer is enough and works the same in Node and the browser.

export interface XmlElement {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: XmlElement[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[e] ?? m;
  });
}

function parseAttrs(raw: string, tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const key = m[1]!;
    if (key in attrs) throw new Error(`<${tag}> has a duplicate "${key}" attribute`);
    attrs[key] = decode(m[2] ?? m[3] ?? '');
  }
  return attrs;
}

/** Parse an XML document and return its root element. Throws on malformed input. */
export function parseXml(source: string): XmlElement {
  const src = source
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '');
  const token =
    /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g;

  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;

  for (const m of src.matchAll(token)) {
    const [, closing, name, rawAttrs, selfClosing, text, stray] = m;
    if (stray) throw new Error(`Malformed markup near "${src.slice(m.index, m.index + 20)}"`);
    if (text !== undefined) {
      const top = stack[stack.length - 1];
      if (top) top.text += decode(text);
      else if (text.trim()) throw new Error('Text outside the root element');
      continue;
    }
    if (closing) {
      const open = stack.pop();
      if (!open || open.name !== name) throw new Error(`Unexpected </${name}>`);
      continue;
    }
    const el: XmlElement = { name: name!, attrs: parseAttrs(rawAttrs ?? '', name!), children: [], text: '' };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(el);
    else if (root) throw new Error('More than one root element');
    else root = el;
    if (!selfClosing) stack.push(el);
  }

  if (stack.length > 0) throw new Error(`Unclosed <${stack[stack.length - 1]!.name}>`);
  if (!root) throw new Error('No root element');
  return root;
}

/** Visit an element and all its descendants in document order. */
export function walk(el: XmlElement, visit: (el: XmlElement) => void): void {
  visit(el);
  for (const child of el.children) walk(child, visit);
}
