// Shared mutable app state. Modules mutate these objects rather than reassigning imported bindings.
export const pairs = [];
export const state = {
  current: null, // { pair, kind: 'in' | 'out' | view }
  draft: null,   // view being configured: { pair, view, loop: path, filters: [path], schema, data, mode, xml }
  restoring: false,
};
export const evaluate = { open: false, groups: [] }; // groups: { target: 'num:out', sections: [{ id, title, text }] }
