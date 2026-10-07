

export const MAX_PREVIEW = 80;
export const LONG_STRING = 80;
export const CHUNK = 200; // tree children built per step

export const STORE_KEY = 'json-viewer-state';

export const PAGE = 50;          // outputs rendered per page
export const PAGE_CHARS = 200000; // ...or until a page has produced this much text
export const SHOW_CHARS = 20000; // characters of one output shown before "Show all"

export const STATE_FORMAT = 'json-viewer-state'; // marker identifying exported state files
export const STATE_VERSION = 1;                  // bump with a matching entry in persistence.js migrations
