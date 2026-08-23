import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const file = join(repository, "host-service-completion.ts")
const marker = "endpoint: \"\""
const source = `import type { Host } from "./source/host.js"

declare const host: Host

host.service({ program: "counter", endpoint: "", name: "state" })
`
const position = source.indexOf(marker) + "endpoint: \"".length
const host = {
  ...ts.sys,
  getCompilationSettings: () => ({
    lib: ["lib.dom.d.ts", "lib.esnext.d.ts"],
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    target: ts.ScriptTarget.ESNext
  }),
  getCurrentDirectory: () => repository,
  getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
  getScriptFileNames: () => [file],
  getScriptSnapshot: path => {
    if (path === file) return ts.ScriptSnapshot.fromString(source)
    if (!ts.sys.fileExists(path)) return undefined
    return ts.ScriptSnapshot.fromString(readFileSync(path, "utf8"))
  },
  getScriptVersion: () => "0"
}
const service = ts.createLanguageService(host)
const completions = service.getCompletionsAtPosition(file, position, {})?.entries.map(entry => entry.name)

assert.deepEqual(completions, ["server", "client"])
