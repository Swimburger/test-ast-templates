// demo.ts — generates a small but realistic C# SDK:
//
//   src/Types/ShapeKind.cs    — enum with XML doc comments
//   src/Types/Shape.cs        — discriminated union (record + JsonConverter)
//   src/Errors/ApiException.cs — base exception class
//   src/ShapeClient.cs        — async service client with one endpoint
//
// Run with: npx tsx demo-csharp.ts

import { cs } from "./csharp/index.js";

const opts = { indentStyle: { type: "spaces" as const, size: 4 } };

function file(path: string, nodes: unknown[]): void {
    console.log(`\n${"═".repeat(64)}`);
    console.log(`  ${path}`);
    console.log(`${"═".repeat(64)}\n`);
    console.log(cs.renderFile(nodes as any, opts));
}

// ---------------------------------------------------------------------------
// Common references
// ---------------------------------------------------------------------------

const JsonConverter         = cs.attributeRef<"class">("JsonConverter",        { namespace: "System.Text.Json.Serialization" });
const JsonConverterFactory  = cs.classRef({ localName: "JsonConverterFactory",  namespace: "System.Text.Json.Serialization" });
const JsonSerializerOptions = cs.classRef({ localName: "JsonSerializerOptions", namespace: "System.Text.Json" });
const JsonSerializer        = cs.classRef({ localName: "JsonSerializer",        namespace: "System.Text.Json" });
const HttpClient            = cs.classRef({ localName: "HttpClient",            namespace: "System.Net.Http" });
const JsonException         = cs.classRef({ localName: "JsonException",         namespace: "System.Text.Json" });
const ApiException          = cs.classRef({ localName: "ApiException",          namespace: "MyApi.Errors" });

// ---------------------------------------------------------------------------
// IR — the "intermediate representation" a real generator would receive
// ---------------------------------------------------------------------------

const unionTypes = [
    { wireValue: "circle",    pascalCase: "Circle",    fields: [{ name: "Radius",  type: "double" }] },
    { wireValue: "rectangle", pascalCase: "Rectangle", fields: [{ name: "Width",   type: "double" }, { name: "Height", type: "double" }] },
    { wireValue: "triangle",  pascalCase: "Triangle",  fields: [{ name: "Base",    type: "double" }, { name: "Height", type: "double" }] },
];

const discriminant = "Type";

// ---------------------------------------------------------------------------
// File 1: src/Types/ShapeKind.cs  (enum + doc comment)
// ---------------------------------------------------------------------------

file("src/Types/ShapeKind.cs", [
    cs.enum("ShapeKind")
        .access("public")
        .doc({
            summary: "Identifies the concrete shape type carried in a Shape payload.",
        })
        .member("Circle")
        .member("Rectangle")
        .member("Triangle")
        .build(),
]);

// ---------------------------------------------------------------------------
// File 2: src/Types/Shape.cs
//
// Discriminated union record with:
//   - one property per member type
//   - Match() returning T via switch expression
//   - Visit() via switch statement
//   - [JsonConverter] attribute pointing to a nested converter class
// ---------------------------------------------------------------------------

file("src/Types/Shape.cs", [
    cs.record("Shape")
        .access("public")
        .doc({
            summary: "A discriminated union representing one of the supported shape types.",
            remarks:  "Deserialize with the bundled JsonConverter; the Type discriminator drives dispatch.",
        })
        .attribute(cs.classAttribute(JsonConverter).arg("typeof(Shape.JsonConverter)"))
        .property(cs.property(discriminant, "string").access("public").required().get().init()
            .doc("Wire discriminator value, e.g. \"circle\"."))
        .properties(
            unionTypes.map((t) =>
                cs.property(`As${t.pascalCase}`, `${t.pascalCase}?`).access("public").get().init(),
            ),
        )
        .method(
            cs.method("Match")
                .access("public")
                .doc({
                    summary: "Pattern-match over the union, returning a value of type T.",
                    params:  Object.fromEntries(unionTypes.map((t) => [`on${t.pascalCase}`, `Invoked when the shape is ${t.pascalCase}.`])),
                    returns: "The value returned by the matching handler.",
                })
                .typeParam("T")
                .returns("T")
                .params(unionTypes.map((t) => ({ name: `on${t.pascalCase}`, type: cs.raw`Func<${t.pascalCase}, T>` })))
                .body(
                    cs.return(
                        cs.switchExpression(discriminant)
                            .arms(unionTypes.map((t) => ({
                                pattern: `"${t.wireValue}"`,
                                body: cs.raw`on${t.pascalCase}(As${t.pascalCase}!)`,
                            })))
                            .default(cs.throw(cs.instantiate(JsonException).arg(cs.raw`$"Unknown type: {${discriminant}}""`))),
                    ),
                )
                .build(),
        )
        .method(
            cs.method("Visit")
                .access("public")
                .params(unionTypes.map((t) => ({ name: `on${t.pascalCase}`, type: cs.raw`Action<${t.pascalCase}>` })))
                .body(
                    cs.switch(discriminant)
                        .cases(unionTypes.map((t) => ({
                            value: t.wireValue,
                            body: cs.raw`on${t.pascalCase}(As${t.pascalCase}!)`,
                        })))
                        .default(cs.throw(cs.instantiate(JsonException).arg(cs.raw`$"Unknown type: {${discriminant}}"`))),
                )
                .build(),
        )
        .nestedRecords(
            unionTypes.map((t) =>
                cs.record(t.pascalCase)
                    .access("public")
                    .primaryCtor(t.fields.map((f) => ({ name: f.name, type: f.type })))
                    .build(),
            ),
        )
        .nestedClass(
            cs.class("JsonConverter")
                .access("public")
                .extends(JsonConverterFactory)
                .method(
                    cs.method("CreateConverter")
                        .access("public")
                        .override()
                        .returns(cs.raw`System.Text.Json.Serialization.JsonConverter?`)
                        .param({ name: "typeToConvert", type: "Type" })
                        .param({ name: "options",       type: JsonSerializerOptions })
                        .body(cs.return(cs.raw`new ShapeConverter(options)`))
                        .build(),
                )
                .build(),
        )
        .build(),
]);

// ---------------------------------------------------------------------------
// File 3: src/Errors/ApiException.cs
// ---------------------------------------------------------------------------

file("src/Errors/ApiException.cs", [
    cs.class("ApiException")
        .namespace("MyApi.Errors")
        .access("public")
        .doc("Base class for all API errors returned by the server.")
        .primaryCtor([
            { name: "message",    type: "string" },
            { name: "statusCode", type: "int" },
            { name: "body",       type: "object" },
        ])
        .extends("Exception", ["message"])
        .properties([
            cs.property("StatusCode", "int").access("public").get().initialValue("statusCode")
                .doc("The HTTP status code returned by the server."),
            cs.property("Body", "object").access("public").get().initialValue("body")
                .doc("The raw response body."),
        ])
        .method(
            cs.method("ToString")
                .access("public")
                .override()
                .returns("string")
                .body(cs.return(cs.raw`$"ApiException: {Message}\\nStatus: {StatusCode}\\nBody: {Body}"`))
                .build(),
        )
        .build(),
]);

// ---------------------------------------------------------------------------
// File 4: src/ShapeClient.cs
// ---------------------------------------------------------------------------

file("src/ShapeClient.cs", [
    cs.class("ShapeClient")
        .namespace("MyApi")
        .access("public")
        .doc("HTTP client for the Shape API.")
        .field(
            cs.field("_client", HttpClient).access("private").readonly().build(),
        )
        .ctor(
            cs.ctor("ShapeClient")
                .access("public")
                .param({ name: "client", type: HttpClient })
                .body(cs.assign("_client", "client"))
                .build(),
        )
        .method(
            cs.method("GetShapeAsync")
                .access("public")
                .async()
                .doc({
                    summary: "Fetch a single shape by identifier.",
                    params:  { id: "The shape identifier." },
                    returns: "The deserialized Shape.",
                })
                .returns("Shape")
                .param({ name: "id", type: "string" })
                .body(
                    cs.raw`var response = await _client.GetAsync($"/shapes/{id}", cancellationToken).ConfigureAwait(false);`,
                    cs.if("!response.IsSuccessStatusCode")
                        .then(
                            cs.using("errorBody", cs.raw`response.Content.ReadAsStream()`)
                                .declaration()
                                .build(),
                            cs.throw(cs.instantiate(ApiException).arg('"Request failed"').arg("(int)response.StatusCode").arg('"error"')),
                        ),
                    cs.raw`var json = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);`,
                    cs.return(
                        cs.nullCoalesce(
                            cs.raw`${JsonSerializer}.Deserialize<Shape>(json)`,
                            cs.throw(cs.instantiate(JsonException).arg('"Response was null"')),
                        ),
                    ),
                )
                .build(),
        )
        .method(
            cs.method("CreateShapeAsync")
                .access("public")
                .async()
                .doc({
                    summary: "Create a new shape.",
                    params:  { shape: "The shape payload to send." },
                })
                .param({ name: "shape", type: "Shape" })
                .body(
                    cs.raw`var json    = ${JsonSerializer}.Serialize(shape);`,
                    cs.raw`var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");`,
                    cs.using("response", cs.raw`await _client.PostAsync("/shapes", content, cancellationToken).ConfigureAwait(false)`)
                        .body(
                            cs.if("!response.IsSuccessStatusCode")
                                .then(
                                    cs.throw(cs.instantiate(ApiException).arg('"Request failed"').arg("(int)response.StatusCode").arg('"error"')),
                                ),
                        )
                        .build(),
                )
                .build(),
        )
        .build(),
]);
