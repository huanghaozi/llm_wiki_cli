import chalk from "chalk"
import ora from "ora"
import { join } from "node:path"
import { loadConfig } from "../lib/config-store.js"
import { embedAllPages, vectorCountChunks, getLastEmbeddingError } from "../lib/embedding.js"

interface EmbedOptions {
  projectPath?: string
  force?: boolean
}

export async function embedCommand(options: EmbedOptions) {
  const config = loadConfig()
  const projectPath = options.projectPath || process.cwd()
  const emb = config.embedding

  if (!emb?.enabled) {
    console.log(chalk.yellow("Embedding is disabled. Run 'llm-wiki config --embedding' to configure."))
    return
  }
  if (!emb.apiKey && !emb.endpoint.includes("localhost") && !emb.endpoint.includes("127.0.0.1")) {
    console.log(chalk.yellow("No embedding API key configured."))
    return
  }

  const existing = await vectorCountChunks(projectPath)
  if (existing > 0 && !options.force) {
    console.log(chalk.dim(`Existing index: ${existing} chunks. Use --force to re-index all pages.`))
  }

  const spinner = ora("Embedding wiki pages...").start()
  let lastProgress = ""

  const count = await embedAllPages(projectPath, emb, (done, total) => {
    lastProgress = `${done}/${total}`
    spinner.text = `Embedding wiki pages (${lastProgress})...`
  })

  spinner.stop()
  const finalCount = await vectorCountChunks(projectPath)
  const err = getLastEmbeddingError()

  if (err) console.log(chalk.yellow(`Warning: ${err}`))
  console.log(chalk.green(`Indexed ${count} page(s). Vector store: ${finalCount} chunks.`))
  console.log(chalk.dim(`Storage: ${join(projectPath, ".llm-wiki", "lancedb")}`))
}
