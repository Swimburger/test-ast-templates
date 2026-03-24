import type { Reference } from "../core/Reference.js";

export interface TypeScriptReference extends Reference {
    // Relative or absolute module path. Undefined = same-file, no import needed.
    modulePath?: string;
    // True  → import LocalName from "..."
    defaultImport?: boolean;
    // Defined → import * as <starImport> from "..."
    starImport?: string;
    // True → import type { ... }
    typeOnly?: boolean;
}
