export interface ILanguageConfig {
    statementTerminator: string;  // ";" for most, "" for Go/Swift/Ruby
    scopeOpen: string;            // "{" or "" (Ruby)
    scopeClose: string;           // "}" or "end" (Ruby)
    scopeStyle: "allman" | "kr";  // brace placement
}

export const CSHARP_CONFIG: ILanguageConfig = {
    statementTerminator: ";",
    scopeOpen: "{",
    scopeClose: "}",
    scopeStyle: "allman",
};

export const TYPESCRIPT_CONFIG: ILanguageConfig = {
    statementTerminator: ";",
    scopeOpen: "{",
    scopeClose: "}",
    scopeStyle: "kr",
};

export const PHP_CONFIG: ILanguageConfig = {
    statementTerminator: ";",
    scopeOpen: "{",
    scopeClose: "}",
    scopeStyle: "kr",
};

export const JAVA_CONFIG: ILanguageConfig = {
    statementTerminator: ";",
    scopeOpen: "{",
    scopeClose: "}",
    scopeStyle: "kr",
};

export const RUST_CONFIG: ILanguageConfig = {
    statementTerminator: ";",
    scopeOpen: "{",
    scopeClose: "}",
    scopeStyle: "kr",
};

export const GO_CONFIG: ILanguageConfig = {
    statementTerminator: "",
    scopeOpen: "{",
    scopeClose: "}",
    scopeStyle: "kr",
};

export const SWIFT_CONFIG: ILanguageConfig = {
    statementTerminator: "",
    scopeOpen: "{",
    scopeClose: "}",
    scopeStyle: "kr",
};

export const RUBY_CONFIG: ILanguageConfig = {
    statementTerminator: "",
    scopeOpen: "",
    scopeClose: "end",
    scopeStyle: "kr",
};
