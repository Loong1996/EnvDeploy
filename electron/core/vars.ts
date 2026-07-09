export function expandVars(input: string, env: NodeJS.ProcessEnv = process.env): string {
  return input.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => {
    const value = env[name]
    if (value === undefined) throw new Error(`未定义的环境变量: ${name}`)
    return value
  })
}
