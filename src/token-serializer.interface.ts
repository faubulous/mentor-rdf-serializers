import { SerializationResult } from "./serialization-result";
import { IQuadSerializer } from "./quad-serializer.interface";
import { TokenSerializerOptions } from "./token-serializer";

/**
 * Interface for serializers that support token-based serialization.
 * This allows serializing directly from parser tokens while preserving
 * source information like blank node IDs.
 */
export interface ITokenSerializer extends IQuadSerializer {
    /**
     * Serializes from Chevrotain tokens, preserving blank node IDs and source positions.
     */
    serializeFromTokens(tokens: unknown[], options?: TokenSerializerOptions): SerializationResult;
}