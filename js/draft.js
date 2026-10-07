import { $ } from './dom.js';
import { state } from './state.js';
import { newSchema, schemaAt } from './schema.js';

export const asName = () => $('#vc-as').value.trim() || 'item';

export const itemSchema = () => schemaAt(state.draft.schema, state.draft.loop) || newSchema();

export function baseScope() { return { [asName()]: itemSchema() }; }
