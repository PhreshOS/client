import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const file = join(repository, "system-service-completion.ts")
const marker = "endpoint: \"\""
const source = `import type { System } from "./source/system.js"

declare const system: System

system.service({ program: "counter", endpoint: "", name: "state" })
`
const position = source.indexOf(marker) + "endpoint: \"".length
const languageHost = {
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
  getScriptVersion: () => "0",
  useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames
}
const service = ts.createLanguageService(languageHost)
const completions = service.getCompletionsAtPosition(file, position, {})?.entries.map(entry => entry.name)

assert.deepEqual(completions, ["server", "client"])
