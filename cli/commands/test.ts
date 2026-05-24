import chalk from "chalk"
import ora from "ora"
import { loadConfig } from "../lib/config-store.js"
import { streamChat } from "../lib/llm-client.js"

interface TestOptions {
  provider?: string
}

export async function testCommand(options: TestOptions) {
  const config = loadConfig()

  if (!config.apiKey && config.provider !== "ollama") {
    console.log(chalk.red("No API key configured. Run 'llm-wiki config' first."))
    return
  }

  console.log(chalk.bold("\nLLM Connection Test\n"))
  console.log(`Provider: ${chalk.cyan(config.provider)}`)
  console.log(`Model: ${chalk.cyan(config.model)}\n`)

  // Connection test
  const connSpinner = ora("Testing connection...").start()
  const started = performance.now()
  let content = ""
  let errorMessage: string | null = null

  await streamChat(
    config,
    [
      { role: "system", content: "You are a connection checker. Reply briefly." },
      { role: "user", content: "Reply with one short word." },
    ],
    {
      onToken: (token) => { content += token },
      onDone: () => {},
      onError: (err) => { errorMessage = err.message },
    },
  )

  if (errorMessage) {
    connSpinner.fail(chalk.red(`Connection failed: ${errorMessage}`))
    return
  }

  if (!content.trim()) {
    connSpinner.fail(chalk.red("Model connected but returned empty content."))
    return
  }

  const elapsed = Math.round(performance.now() - started)
  connSpinner.succeed(chalk.green(`Connected in ${elapsed}ms. Response: "${content.trim().slice(0, 80)}"`))

  // Functional test
  const funcSpinner = ora("Testing functional correctness...").start()
  let funcContent = ""
  let funcError: string | null = null

  await streamChat(
    config,
    [
      {
        role: "system",
        content: "You are a deterministic API test. Do not explain. Output only the requested token.",
      },
      { role: "user", content: "Output exactly this token and nothing else: LLM_WIKI_TEST_OK" },
    ],
    {
      onToken: (token) => { funcContent += token },
      onDone: () => {},
      onError: (err) => { funcError = err.message },
    },
  )

  if (funcError) {
    funcSpinner.fail(chalk.red(`Functional test failed: ${funcError}`))
    return
  }

  const trimmed = funcContent.trim()
  if (!trimmed.includes("LLM_WIKI_TEST_OK")) {
    funcSpinner.fail(chalk.red(`Functional test failed. Response: ${trimmed.slice(0, 120) || "(empty)"}`))
    return
  }

  funcSpinner.succeed(chalk.green("Functional test passed. Model follows instructions correctly."))

  console.log(chalk.bold("\nAll tests passed!"))
}
