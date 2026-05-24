/**
 * Azure OpenAI endpoint helpers.
 *
 * Azure endpoints have the shape:
 *   https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=<version>
 *
 * Users typically paste either the full path (with `/chat/completions`)
 * or just the resource URL. This module normalizes both shapes into
 * the canonical form.
 */

export function isAzureOpenAiEndpoint(endpoint: string): boolean {
  return /\.openai\.azure\.com\//i.test(endpoint) || /\/openai\/deployments\//i.test(endpoint)
}

export interface AzureEndpointInfo {
  baseUrl: string
  deployment: string
  apiVersion: string
}

const DEFAULT_API_VERSION = "2024-08-01-preview"

export function parseAzureOpenAiEndpoint(endpoint: string, fallbackDeployment?: string): AzureEndpointInfo {
  const trimmed = endpoint.trim()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error(`Invalid Azure OpenAI endpoint: ${endpoint}`)
  }

  const params = url.searchParams
  const apiVersion = params.get("api-version") ?? DEFAULT_API_VERSION

  const path = url.pathname.replace(/\/+$/, "")
  const deploymentMatch = path.match(/\/openai\/deployments\/([^/]+)/i)
  const deployment = deploymentMatch?.[1] ?? fallbackDeployment ?? ""

  const baseUrl = `${url.protocol}//${url.host}`
  return { baseUrl, deployment, apiVersion }
}

export function buildAzureOpenAiUrl(
  endpoint: string,
  deployment: string,
  pathSuffix: "chat/completions" | "embeddings",
): string {
  const parsed = parseAzureOpenAiEndpoint(endpoint, deployment)
  const effectiveDeployment = parsed.deployment || deployment
  if (!effectiveDeployment) {
    throw new Error("Azure OpenAI deployment name is required (use the deployment name as the model field).")
  }
  return `${parsed.baseUrl}/openai/deployments/${encodeURIComponent(effectiveDeployment)}/${pathSuffix}?api-version=${encodeURIComponent(parsed.apiVersion)}`
}
