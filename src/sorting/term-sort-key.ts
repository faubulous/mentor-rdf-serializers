import type { Literal, Term } from '@rdfjs/types';
import type { Rdf12Term, TripleTerm } from '../utilities/types.js';
import { normalizeBlankNodeId } from '../utilities/blank-nodes';

/**
 * The key the sorting strategies order terms by: `<iri>`, `_:label`, `"value"@language^^datatype`.
 * It is a sort order, not an identity: blank node labels are normalised and a literal's direction
 * is not part of it. Terms are identified by `termToString` of `rdf-string`.
 * @param term The term.
 * @returns The key.
 */
export function getTermSortKey(term: Term | Rdf12Term): string {
    if (!term) {
        return '';
    }

    switch (term.termType) {
        case 'NamedNode': {
            const v = term.value;
            return `<${v}>`;
        }
        case 'BlankNode': {
            const v = normalizeBlankNodeId(term.value);
            return `_:${v}`;
        }
        case 'Literal': {
            const v = term.value;
            const l = (term as Literal).language || '';
            const d = (term as Literal).datatype?.value || '';
            return `"${v}"@${l}^^${d}`;
        }
        case 'Variable': {
            const v = term.value;
            return `?${v}`;
        }
        case 'DefaultGraph': {
            return '';
        }
        case 'TripleTerm': {
            const t = term as TripleTerm;
            const s = getTermSortKey(t.subject);
            const p = getTermSortKey(t.predicate);
            const o = getTermSortKey(t.object);
            return `<<(${s} ${p} ${o})>>`;
        }
        default: {
            // For unknown term types, try to access value property safely
            return (term as { value?: string }).value || '';
        }
    }
}
