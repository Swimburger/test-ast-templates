// Language-agnostic contract for a type reference.
// Every generator's ClassReference satisfies this interface.
// The Writer's addReference() hook receives values of this type.
export interface Reference {
    // The name as it appears at the use-site after import resolution.
    // e.g. "User", "Types.User", "UserType"
    readonly localName: string;
}
