import { loadConfig } from "./config-store.js"

export function applyProxyFromConfig(): void {
  const config = loadConfig()
  const proxy = config.httpProxy?.trim()
  if (!proxy) return

  process.env.HTTP_PROXY = proxy
  process.env.HTTPS_PROXY = proxy
  process.env.http_proxy = proxy
  process.env.https_proxy = proxy

  const noProxy = config.noProxy?.trim()
  if (noProxy) {
    process.env.NO_PROXY = noProxy
    process.env.no_proxy = noProxy
  }
}

export function describeProxy(): string {
  const config = loadConfig()
  if (!config.httpProxy?.trim()) return "Not configured"
  return config.httpProxy
}
