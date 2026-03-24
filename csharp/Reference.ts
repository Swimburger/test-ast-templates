import type { Reference } from "../core/Reference.js";

export interface CSharpReference extends Reference {
    // The C# namespace to emit as a `using` directive.
    // Undefined = no using needed (built-in or already in scope).
    namespace?: string;
}
