// Guard private dotenv files while envsitter-guard still targets OpenCode V1.
// .env.example stays readable for setup instructions.
const secretPath = (value: unknown): boolean => {
  if (typeof value !== "string") return false
  const path = value.replaceAll("\\", "/")
  return /(^|\/)\.env(?!\.example(?:$|\/))(?:$|\.)/.test(path) || /(^|\/)\.envsitter\/pepper$/.test(path)
}

export default {
  id: "env-file-guard",
  async setup(ctx: { tool: { hook: (name: string, callback: (event: { tool: string; input: unknown }) => void) => Promise<unknown> } }) {
    await ctx.tool.hook("execute.before", (event) => {
      if (!["read", "write", "edit", "patch", "multiedit"].includes(event.tool.toLowerCase())) return
      const input = event.input as Record<string, unknown> | null
      const path = input?.filePath ?? input?.file_path ?? input?.path
      if (secretPath(path)) throw new Error("Direct access to private .env files is blocked.")
    })
  },
}
