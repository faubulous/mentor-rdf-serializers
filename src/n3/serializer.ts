import type { Quad, Variable } from '@rdfjs/types';
import type {
    Rdf12Quad,
    SerializerOptions,
    SerializationResult,
    RdfSyntax as RdfSyntaxType
} from '../types.js';
import { RdfSyntax } from '../types.js';
import { TurtleSerializer } from '../turtle/serializer.js';

/**
 * N3-specific term representing a formula (graph literal).
 */
export interface N3Formula {
    termType: 'Formula';
    value: string;
    /** Quads contained within this formula */
    quads: Array<Quad | Rdf12Quad>;
    equals(other: unknown): boolean;
}

/**
 * N3-specific term representing a quick variable (~var).
 */
export interface N3QuickVariable {
    termType: 'QuickVariable';
    value: string;
    equals(other: unknown): boolean;
}

/**
 * Checks if a term is an N3 formula.
 */
export function isN3Formula(term: unknown): term is N3Formula {
    return term !== null && typeof term === 'object' && (term as N3Formula).termType === 'Formula';
}

/**
 * Checks if a term is an N3 quick variable.
 */
export function isN3QuickVariable(term: unknown): term is N3QuickVariable {
    return term !== null && typeof term === 'object' && (term as N3QuickVariable).termType === 'QuickVariable';
}

/**
 * N3-specific options extending standard serializer options.
 */
export interface N3SerializerOptions extends SerializerOptions {
    /**
     * Whether to use the => shorthand for log:implies.
     * Default: true
     */
    useImpliesShorthand?: boolean;

    /**
     * Whether to use the = shorthand for owl:sameAs.
     * Default: true
     */
    useSameAsShorthand?: boolean;

    /**
     * Whether to use the @forAll and @forSome quantifiers.
     * Default: true
     */
    useQuantifiers?: boolean;
}

/**
 * Serializer for N3 (Notation3) format.
 * 
 * N3 extends Turtle with additional features:
 * - Formulas (graph literals): { ... }
 * - Implications: { antecedent } => { consequent }
 * - Universal quantification: @forAll :x .
 * - Existential quantification: @forSome :x .
 * - Quick variables: ~x
 * - Built-in predicates for logic and computation
 * 
 * @see https://w3c.github.io/N3/spec/
 */
export class N3Serializer extends TurtleSerializer {
    override readonly syntax: RdfSyntaxType = RdfSyntax.N3;

    private n3Options: N3SerializerOptions = {};

    /**
     * The log: namespace IRI for N3 built-ins.
     */
    static readonly LOG_NAMESPACE = 'http://www.w3.org/2000/10/swap/log#';

    /**
     * The log:implies predicate IRI.
     */
    static readonly LOG_IMPLIES = `${N3Serializer.LOG_NAMESPACE}implies`;

    /**
     * The owl:sameAs predicate IRI.
     */
    static readonly OWL_SAMEAS = 'http://www.w3.org/2002/07/owl#sameAs';

    /**
     * Serializes a single quad to N3 format.
     */
    override serializeQuad(quad: Quad | Rdf12Quad, options?: N3SerializerOptions): string {
        const opts = this.getN3Options(options);

        // Check for implications shorthand
        if (opts.useImpliesShorthand !== false && 
            quad.predicate.termType === 'NamedNode' && 
            quad.predicate.value === N3Serializer.LOG_IMPLIES) {
            const subject = this.serializeN3Term(quad.subject, opts);
            const object = this.serializeN3Term(quad.object, opts);
            return `${subject} => ${object} .`;
        }

        // Check for sameAs shorthand
        if (opts.useSameAsShorthand !== false && 
            quad.predicate.termType === 'NamedNode' && 
            quad.predicate.value === N3Serializer.OWL_SAMEAS) {
            const subject = this.serializeN3Term(quad.subject, opts);
            const object = this.serializeN3Term(quad.object, opts);
            return `${subject} = ${object} .`;
        }

        const subject = this.serializeN3Term(quad.subject, opts);
        const predicate = this.serializeN3Term(quad.predicate, opts);
        const object = this.serializeN3Term(quad.object, opts);

        return `${subject} ${predicate} ${object} .`;
    }

    /**
     * Serializes a term with N3-specific handling.
     */
    private serializeN3Term(term: unknown, opts: Required<N3SerializerOptions>): string {
        if (isN3Formula(term)) {
            return this.serializeFormula(term, opts);
        }

        if (isN3QuickVariable(term)) {
            return `~${term.value}`;
        }

        return this.serializeTerm(term as Quad['subject'], opts);
    }

    /**
     * Serializes an N3 formula (graph literal).
     */
    private serializeFormula(formula: N3Formula, opts: Required<N3SerializerOptions>): string {
        if (formula.quads.length === 0) {
            return '{}';
        }

        const indent = opts.prettyPrint ? opts.indent : '';
        const lineEnd = opts.prettyPrint ? opts.lineEnd : ' ';

        if (opts.prettyPrint && formula.quads.length > 1) {
            const lines = formula.quads.map(q => {
                const s = this.serializeN3Term(q.subject, opts);
                const p = this.serializeN3Term(q.predicate, opts);
                const o = this.serializeN3Term(q.object, opts);
                return `${indent}${s} ${p} ${o} .`;
            });
            return `{${lineEnd}${lines.join(lineEnd)}${lineEnd}}`;
        }

        const triples = formula.quads.map(q => {
            const s = this.serializeN3Term(q.subject, opts);
            const p = this.serializeN3Term(q.predicate, opts);
            const o = this.serializeN3Term(q.object, opts);
            return `${s} ${p} ${o} .`;
        }).join(' ');

        return `{ ${triples} }`;
    }

    /**
     * Serializes a variable (N3 supports both ?var and $var syntax).
     */
    protected override serializeVariable(variable: Variable, _opts: Required<SerializerOptions>): string {
        return `?${variable.value}`;
    }

    /**
     * Gets merged N3 options with defaults.
     */
    private getN3Options(options?: N3SerializerOptions): Required<N3SerializerOptions> {
        const baseOpts = this.getOptions(options);
        return {
            ...baseOpts,
            useImpliesShorthand: options?.useImpliesShorthand ?? true,
            useSameAsShorthand: options?.useSameAsShorthand ?? true,
            useQuantifiers: options?.useQuantifiers ?? true
        };
    }

    /**
     * Formats quads with detailed result information.
     */
    override format(quads: Iterable<Quad | Rdf12Quad>, options?: N3SerializerOptions): SerializationResult {
        return {
            output: this.serialize(quads, options)
        };
    }
}
