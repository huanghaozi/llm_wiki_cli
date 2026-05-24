import type { CliConfig } from "../types/cli.js"
import { streamChat, type ChatMessage, type StreamCallbacks } from "./llm-client.js"

export const CAPTION_PROMPT =
  "Describe this image factually for a knowledge-base index. Include: any visible text verbatim, chart axes and values, diagram structure (boxes/arrows/labels), key visual elements. Do NOT speculate or editorialize. 2 to 4 sentences. Output plain text only — no markdown, no preamble."

function resolveVisionConfig(config: CliConfig): CliConfig {
  const mm = config.multimodal
  if (!mm?.enabled) throw new Error("Multimodal captioning is disabled")
  if (mm.useMainLlm) return config
  return {
    ...config,
    provider: mm.provider ?? config.provider,
    apiKey: mm.apiKey ?? config.apiKey,
    model: mm.model ?? config.model,
    ollamaUrl: mm.ollamaUrl ?? config.ollamaUrl,
    customEndpoint: mm.customEndpoint ?? config.customEndpoint,
  }
}

export async function captionImage(
  imageBase64: string,
  mediaType: string,
  config: CliConfig,
): Promise<string> {
  const llmConfig = resolveVisionConfig(config)
  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: CAPTION_PROMPT },
        { type: "image", mediaType, dataBase64: imageBase64 },
      ],
    },
  ]

  let result = ""
  let error: Error | null = null
  await streamChat(llmConfig, messages, {
    onToken: (t) => { result += t },
    onDone: () => {},
    onError: (e) => { error = e },
  })
  if (error) throw error
  return result.trim()
}

export function mimeFromPath(filePath: string): string {
  const ext = filePath.toLowerCase().split(".").pop()
  switch (ext) {
    case "png": return "image/png"
    case "jpg":
    case "jpeg": return "image/jpeg"
    case "webp": return "image/webp"
    case "gif": return "image/gif"
    default: return "application/octet-stream"
  }
}
