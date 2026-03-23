import type { IToken } from 'chevrotain';
import DataFactory from '@rdfjs/data-model';
import { bench, describe } from 'vitest';
import type { QuadContext } from '@faubulous/mentor-rdf-parsers';
import { StatementSerializer } from './statement-serializer.js';
import { TurtleSerializer } from './turtle/turtle-serializer.js';

const prefixes = {
  ex: 'http://example.org/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#'
};

const serializer = new StatementSerializer(new TurtleSerializer());

const stableBenchOptions = {
  time: 2000,
  warmupTime: 500
};

const syntheticToken: IToken = {
  image: '',
  startOffset: Infinity,
  endOffset: Infinity,
  startLine: Infinity,
  endLine: Infinity,
  startColumn: Infinity,
  endColumn: Infinity,
  tokenType: { name: 'SYNTHETIC' } as any,
  tokenTypeIdx: -1
} as IToken;

function createCommentToken(image: string): IToken {
  return {
    image,
    startOffset: Infinity,
    endOffset: Infinity,
    startLine: Infinity,
    endLine: Infinity,
    startColumn: Infinity,
    endColumn: Infinity,
    tokenType: { name: 'COMMENT' } as any,
    tokenTypeIdx: -1
  } as IToken;
}

function createContext(subjectIndex: number, predicateIndex: number, objectIndex: number): QuadContext {
  const subject = DataFactory.namedNode(`http://example.org/S${subjectIndex}`);
  const predicate = DataFactory.namedNode(`http://example.org/p${predicateIndex}`);
  const object = DataFactory.namedNode(`http://example.org/O${objectIndex}`);
  const quad = DataFactory.quad(subject, predicate, object);

  return {
    ...quad,
    subjectToken: syntheticToken,
    predicateToken: syntheticToken,
    objectToken: syntheticToken,
    leadingComments: [],
    trailingComment: undefined
  } as QuadContext;
}

function createDataset(subjects: number, predicatesPerSubject: number): QuadContext[] {
  const contexts: QuadContext[] = [];

  for (let s = 0; s < subjects; s++) {
    for (let p = 0; p < predicatesPerSubject; p++) {
      contexts.push(createContext(s, p, s * predicatesPerSubject + p));
    }
  }

  return contexts;
}

function createCommentHeavyDataset(subjects: number, predicatesPerSubject: number): QuadContext[] {
  const contexts: QuadContext[] = [];

  for (let s = 0; s < subjects; s++) {
    for (let p = 0; p < predicatesPerSubject; p++) {
      const ctx = createContext(s, p, s * predicatesPerSubject + p);
      ctx.leadingComments = [createCommentToken(`# lead:${s}:${p}`) as any];

      if (p % 2 === 0) {
        ctx.trailingComment = createCommentToken(`# tail:${s}:${p}`) as any;
      }

      contexts.push(ctx);
    }
  }

  return contexts;
}

const smallDataset = createDataset(200, 5);
const largeDataset = createDataset(2000, 6);
const commentHeavyDataset = createCommentHeavyDataset(1200, 6);

describe('StatementSerializer benchmark', () => {
  bench('serialize small dataset (1k statements, no sort)', () => {
    serializer.serialize(smallDataset, {
      prefixes,
      sort: false,
      blankLinesBetweenSubjects: true
    });
  }, stableBenchOptions);

  bench('serialize large dataset (12k statements, no sort)', () => {
    serializer.serialize(largeDataset, {
      prefixes,
      sort: false,
      blankLinesBetweenSubjects: true
    });
  }, stableBenchOptions);

  bench('serialize large dataset (12k statements, sort enabled)', () => {
    serializer.serialize(largeDataset, {
      prefixes,
      sort: true,
      blankLinesBetweenSubjects: true
    });
  }, stableBenchOptions);

  bench('serialize comment-heavy dataset (7.2k statements, no sort)', () => {
    serializer.serialize(commentHeavyDataset, {
      prefixes,
      sort: false,
      blankLinesBetweenSubjects: true
    });
  }, stableBenchOptions);

  bench('serialize comment-heavy dataset (7.2k statements, sort enabled)', () => {
    serializer.serialize(commentHeavyDataset, {
      prefixes,
      sort: true,
      blankLinesBetweenSubjects: true
    });
  }, stableBenchOptions);

  bench('serialize large dataset (12k statements, assumeSorted)', () => {
    serializer.serialize(largeDataset, {
      prefixes,
      sort: true,
      assumeSorted: true,
      blankLinesBetweenSubjects: true
    });
  }, stableBenchOptions);
});
