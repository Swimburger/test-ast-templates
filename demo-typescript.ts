// demo-typescript.ts — generates a TypeScript SDK mirroring the C# demo:
//
//   src/types/ShapeKind.ts     — discriminated union type alias
//   src/types/Shape.ts         — variant interfaces + Shape union
//   src/errors/ApiError.ts     — typed error class
//   src/ShapeClient.ts         — async fetch-based client with match helper
//
// Run with: npx tsx demo-typescript.ts

import { ts } from "./typescript/index.js";

const opts = { indentStyle: { type: "spaces" as const, size: 4 } };

function file(path: string, nodes: unknown[]): void {
    console.log(`\n${"═".repeat(64)}`);
    console.log(`  ${path}`);
    console.log(`${"═".repeat(64)}\n`);
    console.log(ts.renderFile(nodes as any, opts));
}

// ---------------------------------------------------------------------------
// IR — same shape domain as the C# demo
// ---------------------------------------------------------------------------

const unionTypes = [
    { wireValue: "circle",    pascalCase: "Circle",    fields: [{ name: "radius",  type: "number" }] },
    { wireValue: "rectangle", pascalCase: "Rectangle", fields: [{ name: "width",   type: "number" }, { name: "height", type: "number" }] },
    { wireValue: "triangle",  pascalCase: "Triangle",  fields: [{ name: "base",    type: "number" }, { name: "height", type: "number" }] },
];

const discriminant = "type";

// ---------------------------------------------------------------------------
// References used across files
// ---------------------------------------------------------------------------

const ApiError    = ts.classRef({ localName: "ApiError",   modulePath: "./errors/ApiError.js" });
const Shape       = ts.classRef({ localName: "Shape",      modulePath: "./types/Shape.js", typeOnly: true });
const variantRefs = Object.fromEntries(
    unionTypes.map((t) => [t.pascalCase, ts.classRef({ localName: t.pascalCase, modulePath: "./types/Shape.js", typeOnly: true })])
) as Record<string, ReturnType<typeof ts.classRef>>;

// ---------------------------------------------------------------------------
// File 1: src/types/ShapeKind.ts
// ---------------------------------------------------------------------------

file("src/types/ShapeKind.ts", [
    ts.typeAlias("ShapeKind", ts.union(...unionTypes.map((t) => ts.literal(t.wireValue))))
        .export()
        .doc("The wire discriminator value identifying a concrete shape variant.")
        .build(),
]);

// ---------------------------------------------------------------------------
// File 2: src/types/Shape.ts
// ---------------------------------------------------------------------------

function buildVariantInterface(t: typeof unionTypes[number]) {
    return ts.interface(t.pascalCase)
        .export()
        .doc(`A ${t.pascalCase.toLowerCase()} shape.`)
        .property(ts.property(discriminant, `"${t.wireValue}"`))
        .properties(t.fields.map((f) => ts.property(f.name, f.type)))
        .build();
}

file("src/types/Shape.ts", [
    ...unionTypes.map(buildVariantInterface),
    ts.typeAlias("Shape", ts.union(...unionTypes.map((t) => t.pascalCase)))
        .export()
        .doc("A discriminated union of all supported shape variants.")
        .build(),
]);

// ---------------------------------------------------------------------------
// File 3: src/errors/ApiError.ts
// ---------------------------------------------------------------------------

file("src/errors/ApiError.ts", [
    ts.class("ApiError")
        .export()
        .extends("Error")
        .doc("Thrown when the Shape API returns a non-2xx response.")
        .property(ts.property("statusCode", "number").access("public").readonly())
        .property(ts.property("body", "unknown").access("public").readonly())
        .ctor(
            ts.ctor()
                .params([
                    { name: "message",    type: "string" },
                    { name: "statusCode", type: "number" },
                    { name: "body",       type: "unknown" },
                ])
                .body(
                    ts.raw`super(message)`,
                    ts.raw`Object.setPrototypeOf(this, new.target.prototype)`,
                    ts.assign("this.statusCode", "statusCode"),
                    ts.assign("this.body", "body"),
                )
                .build(),
        )
        .build(),
]);

// ---------------------------------------------------------------------------
// File 4: src/ShapeClient.ts
// ---------------------------------------------------------------------------

// throwApiError is a top-level helper — demonstrate ts.function builder here.
const _throwApiErrorFn = ts.function("throwApiError")
    .export()
    .param({ name: "response", type: "Response" })
    .param({ name: "body",     type: "unknown" })
    .returns(ts.typeRef("never").build())
    .body(
        ts.throw(ts.new(ApiError).arg("`Request failed: ${response.status}`").arg("response.status").arg("body")),
    )
    .build();
void _throwApiErrorFn;

function throwApiError(message: string) {
    return ts.throw(
        ts.new(ApiError).arg(message).arg("response.status").arg("body"),
    );
}

function buildGetShapeMethod() {
    return ts.method("getShape")
        .access("public")
        .async()
        .doc("Fetch a single shape by identifier.")
        .params([
            { name: "id",     type: "string" },
            { name: "signal", type: "AbortSignal", optional: true },
        ])
        .returns(ts.typeRef("Shape").build())
        .body(
            ts.const("response", ts.await(ts.raw`fetch(\`\${this.baseUrl}/shapes/\${id}\`, { signal })`)),
            ts.if("!response.ok")
                .then(
                    ts.const("body", ts.await(ts.raw`response.json().catch(() => undefined)`)),
                    throwApiError("`Request failed: ${response.status}`"),
                ),
            ts.return(ts.raw`(await response.json()) as ${Shape}`),
        )
        .build();
}

function buildCreateShapeMethod() {
    return ts.method("createShape")
        .access("public")
        .async()
        .doc("Create a new shape.")
        .params([
            { name: "shape",  type: Shape },
            { name: "signal", type: "AbortSignal", optional: true },
        ])
        .body(
            ts.const("response", ts.await(
                ts.raw`fetch(\`\${this.baseUrl}/shapes\`, ${
                    ts.object({
                        method:  ts.literal("POST"),
                        headers: ts.object({ '"Content-Type"': ts.literal("application/json") }),
                        body:    ts.raw`JSON.stringify(shape)`,
                        signal:  "signal",
                    })
                })`,
            )),
            ts.if("!response.ok")
                .then(
                    ts.const("body", ts.await(ts.raw`response.json().catch(() => undefined)`)),
                    throwApiError("`Request failed: ${response.status}`"),
                ),
        )
        .build();
}

function buildListShapesMethod() {
    return ts.method("listShapes")
        .access("public")
        .async()
        .doc("Fetch all shapes and invoke a callback for each one.")
        .param({ name: "onShape", type: ts.raw`(shape: ${Shape}) => void` })
        .body(
            ts.const("response", ts.await(ts.raw`fetch(\`\${this.baseUrl}/shapes\`)`)),
            ts.if("!response.ok")
                .then(
                    ts.const("body", ts.await(ts.raw`response.json().catch(() => undefined)`)),
                    throwApiError("`Request failed: ${response.status}`"),
                ),
            ts.const("shapes", ts.raw`(await response.json()) as ${Shape}[]`),
            ts.forEach("shape", "shapes")
                .body(ts.raw`onShape(shape)`),
        )
        .build();
}

function buildMatchMethod() {
    return ts.method("match")
        .access("public")
        .typeParam("T")
        .doc("Pattern-match over a Shape, returning a value of type T.")
        .params([
            { name: "shape", type: Shape },
            ...unionTypes.map((t) => ({ name: `on${t.pascalCase}`, type: ts.raw`(s: ${variantRefs[t.pascalCase]!}) => T` })),
        ])
        .returns("T")
        .body(
            ts.const(
                "handlers",
                ts.raw`{ ${unionTypes.map((t) => `"${t.wireValue}": on${t.pascalCase}`).join(", ")} } as Record<string, (s: never) => T>`,
            ),
            ts.const("handler", ts.raw`handlers[shape.${discriminant}]`),
            ts.if(`handler == null`)
                .then(ts.throw(ts.raw`new Error(\`Unknown shape type: \${shape.${discriminant}}\`)`)),
            ts.return(ts.raw`handler(shape as never)`),
        )
        .build();
}

file("src/ShapeClient.ts", [
    ts.class("ShapeClient")
        .export()
        .doc("HTTP client for the Shape API.")
        .property(ts.property("baseUrl", "string").access("private").readonly())
        .ctor(
            ts.ctor()
                .param({ name: "baseUrl", type: "string" })
                .body(ts.assign("this.baseUrl", `baseUrl.replace(/\\/+$/, "")`))
                .build(),
        )
        .method(buildGetShapeMethod())
        .method(buildListShapesMethod())
        .method(buildCreateShapeMethod())
        .method(buildMatchMethod())
        .build(),
]);
