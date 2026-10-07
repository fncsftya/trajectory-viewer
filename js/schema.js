import { isContainer } from './util.js';

export const newSchema = () => ({ kids: {}, types: new Set(), array: false });

// Merged schema of a value; arrays are transparent (their elements' shape is merged into one node).
export function buildSchema(v, node = newSchema()) {
  if (Array.isArray(v)) { node.array = true; v.forEach(x => buildSchema(x, node)); }
  else if (isContainer(v)) {
    node.types.add('object');
    for (const [k, x] of Object.entries(v)) buildSchema(x, node.kids[k] ||= newSchema());
  } else node.types.add(v === null ? 'null' : typeof v);
  return node;
}

export function describe(node) {
  if (node.types.has('entry')) return 'key/value entry';
  const t = [...node.types].join('|');
  return node.array ? '[ ] ' + (t || 'empty') : t;
}

export const slug = k => String(k).replace(/[^A-Za-z0-9_]/g, '_');

export function mergeSchema(into, from) {
  from.types.forEach(t => into.types.add(t));
  into.array ||= from.array;
  for (const [k, c] of Object.entries(from.kids)) mergeSchema(into.kids[k] ||= newSchema(), c);
  return into;
}
// Schema of an object's entries: { key, value } where value merges all the keys' shapes.
export function entrySchema(node) {
  const e = newSchema(), value = newSchema();
  e.array = true;
  e.types.add('entry');
  e.kids.key = newSchema(); e.kids.key.types.add('string');
  for (const c of Object.values(node.kids)) mergeSchema(value, c);
  e.kids.value = value;
  return e;
}
export const isObj = node => node.types.has('object') && !node.array;
// Children of a schema node, including the `items` entries of an object.
export const kidsOf = node => {
  const kids = Object.entries(node.kids);
  if (node.types.has('object') && !('items' in node.kids)) kids.push(['items', entrySchema(node)]);
  return kids;
};
export const kidByTok = (node, tok) => { const kid = node && kidsOf(node).find(([k]) => slug(k) === tok); return kid ? kid[1] : null; };

export const schemaAt = (root, path) => path.reduce((n, k) => n?.kids[k], root);
// Keep only the leading part of a path that still exists in the schema.
export const validPath = (root, path) => { const out = []; let n = root; for (const k of path) { if (!n.kids[k]) break; out.push(k); n = n.kids[k]; } return out; };

export function shapeOf(node) {
  const o = { type: [...node.types].join('|') || 'empty' };
  if (node.array) o.array = true;
  if (Object.keys(node.kids).length) o.kids = Object.fromEntries(Object.entries(node.kids).map(([k, c]) => [k, shapeOf(c)]));
  return o;
}
