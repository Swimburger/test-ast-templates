import type { IWriter } from "./IWriter.js";

export abstract class AbstractAstNode {
    public abstract write(writer: IWriter): void;
}
