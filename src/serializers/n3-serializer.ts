import { RdfSyntax } from '@faubulous/mentor-rdf-parsers';
import { Quad, Term, Variable } from '@rdfjs/types';
import { Rdf12Quad, TripleTerm, Formula, QuickVariable } from '@src/types';
import { TurtleSerializer } from '@src/serializers/turtle-serializer';
import { SerializationResult } from '@src/serialization-result';
import { SerializerOptions } from '@src/serializer-options';

export type N3Term = Term | TripleTerm | Formula | QuickVariable;

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
 * @see https://w3c.github.io/N3/spec/
 */
export class N3Serializer extends TurtleSerializer {
    override readonly syntax: RdfSyntax = RdfSyntax.N3;

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
     * Gets merged N3 options with defaults.
     */
    private _getN3Options(options?: N3SerializerOptions): Required<N3SerializerOptions> {
        const baseOpts = this.getOptions(options);

        return {
            ...baseOpts,
            useImpliesShorthand: options?.useImpliesShorthand ?? true,
            useSameAsShorthand: options?.useSameAsShorthand ?? true,
            useQuantifiers: options?.useQuantifiers ?? true
        };
    }

    /**
     * Serializes a single quad to N3 format.
     */
    override serializeQuad(quad: Quad | Rdf12Quad, options?: N3SerializerOptions): string {
        const opts = this._getN3Options(options);

        if (opts.useImpliesShorthand !== false &&
            quad.predicate.termType === 'NamedNode' &&
            quad.predicate.value === N3Serializer.LOG_IMPLIES) {
            const subject = this._serializeN3Term(quad.subject, opts);
            const object = this._serializeN3Term(quad.object, opts);

            return `${subject} => ${object} .`;
        } else if (opts.useSameAsShorthand !== false &&
            quad.predicate.termType === 'NamedNode' &&
            quad.predicate.value === N3Serializer.OWL_SAMEAS) {
            const subject = this._serializeN3Term(quad.subject, opts);
            const object = this._serializeN3Term(quad.object, opts);

            return `${subject} = ${object} .`;
        } else {
            const subject = this._serializeN3Term(quad.subject, opts);
            const predicate = this._serializeN3Term(quad.predicate, opts);
            const object = this._serializeN3Term(quad.object, opts);

            return `${subject} ${predicate} ${object} .`;
        }
    }

    /**
     * Serializes a term with N3-specific handling.
     */
    private _serializeN3Term(term: N3Term, opts: Required<N3SerializerOptions>): string {
        switch (term.termType) {
            case 'Formula':
                return this._serializeFormula(term, opts);
            case 'QuickVariable':
                return this._serializeQuickVariable(term, opts);
            default:
                return this.serializeTerm(term, opts);
        }
    }

    /**
     * Serializes an N3 formula (graph literal).
     */
    private _serializeFormula(formula: Formula, opts: Required<N3SerializerOptions>): string {
        if (formula.quads.length === 0) {
            return '{}';
        }

        const indent = opts.prettyPrint ? opts.indent : '';
        const lineEnd = opts.prettyPrint ? opts.lineEnd : ' ';

        if (opts.prettyPrint && formula.quads.length > 1) {
            const lines = formula.quads.map(q => {
                const s = this._serializeN3Term(q.subject, opts);
                const p = this._serializeN3Term(q.predicate, opts);
                const o = this._serializeN3Term(q.object, opts);
                return `${indent}${s} ${p} ${o} .`;
            });

            return `{${lineEnd}${lines.join(lineEnd)}${lineEnd}}`;
        }

        const triples = formula.quads.map(q => {
            const s = this._serializeN3Term(q.subject, opts);
            const p = this._serializeN3Term(q.predicate, opts);
            const o = this._serializeN3Term(q.object, opts);

            return `${s} ${p} ${o} .`;
        }).join(' ');

        return `{ ${triples} }`;
    }

    /**
     * Serializes a quick variable (~var).
     * @param variable The quick variable to serialize.
     * @param _options The N3 serialization options.
     * @returns The serialized quick variable.
     */
    private _serializeQuickVariable(variable: QuickVariable, _options: Required<N3SerializerOptions>): string {
        return `~${variable.value}`;
    }

    /**
     * Serializes a variable (N3 supports both ?var and $var syntax).
     * @param variable The variable to serialize.
     * @param _opts The N3 serialization options.
     * @returns The serialized variable.
     */
    protected override serializeVariable(variable: Variable, _opts: Required<SerializerOptions>): string {
        return `?${variable.value}`;
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
