# llm-wiki-native

Standalone Rust CLI for LLM Wiki native operations (image extraction and web-clip server). Used by **LLM Wiki CLI** — see [README.md](../README.md) and [docs/CLI.zh-CN.md](../docs/CLI.zh-CN.md).

## Commands

### `extract-images`

Extract embedded raster images from PDF, DOCX, or PPTX files and write them to an output directory.

```bash
llm-wiki-native extract-images --input document.pdf --output-dir ./images --format json
```

Output is a JSON array printed to stdout:

```json
[
  {
    "index": 1,
    "mimeType": "image/png",
    "page": 1,
    "width": 800,
    "height": 600,
    "filePath": "C:/path/to/images/img-1.png",
    "sha256": "..."
  }
]
```

### `clip-server`

Run the HTTP clip server (default port `19827`):

```bash
llm-wiki-native clip-server --port 19827 --project-path /path/to/project
```

Endpoints match the Tauri clip server: `/status`, `/project`, `/projects`, `/clip`, `/clips/pending`.

## Prerequisites

- [Rust toolchain](https://rustup.rs/) (stable, edition 2021)
- **PDF support**: PDFium dynamic library for your platform

Place the PDFium library next to the binary or set:

```bash
export PDFIUM_DYNAMIC_LIB_PATH=/path/to/libpdfium.so   # Linux
export PDFIUM_DYNAMIC_LIB_PATH=/path/to/pdfium.dll     # Windows
export PDFIUM_DYNAMIC_LIB_PATH=/path/to/libpdfium.dylib # macOS
```

Optional resource directory hint:

```bash
export LLM_WIKI_NATIVE_RESOURCE_DIR=/path/to/resources
```

## Build (native host)

From the repository root:

```bash
cd native
cargo build --release
```

Binary: `native/target/release/llm-wiki-native` (or `llm-wiki-native.exe` on Windows).

Or use the helper scripts:

```bash
./scripts/build-native.sh
# PowerShell:
./scripts/build-native.ps1
```

## Cross-compilation targets

Install the target toolchain, then build with `--target`:

| Target | Description |
|--------|-------------|
| `x86_64-pc-windows-msvc` | Windows x64 |
| `aarch64-pc-windows-msvc` | Windows ARM64 |
| `x86_64-unknown-linux-gnu` | Linux x64 |
| `aarch64-unknown-linux-gnu` | Linux ARM64 |

### Windows x64 (from Windows)

```powershell
rustup target add x86_64-pc-windows-msvc
cd native
cargo build --release --target x86_64-pc-windows-msvc
```

### Windows ARM64 (from Windows)

```powershell
rustup target add aarch64-pc-windows-msvc
cd native
cargo build --release --target aarch64-pc-windows-msvc
```

### Linux x64 (from Linux)

```bash
rustup target add x86_64-unknown-linux-gnu
cd native
cargo build --release --target x86_64-unknown-linux-gnu
```

### Linux ARM64 (from Linux)

```bash
rustup target add aarch64-unknown-linux-gnu
cd native
cargo build --release --target aarch64-unknown-linux-gnu
```

Cross-compiling Linux from Windows/macOS requires a cross linker (e.g. `cross` crate or a sysroot). The build scripts accept an optional target argument:

```bash
./scripts/build-native.sh x86_64-unknown-linux-gnu
./scripts/build-native.ps1 -Target x86_64-unknown-linux-gnu
```

## Tests

```bash
cd native
cargo test
```

Unit tests cover helper functions (MIME detection, SHA-256, slugify, date formatting). PDF extraction tests require PDFium at runtime.

## Deployment layout

Recommended layout beside the Node CLI:

```
bin/
  llm-wiki-native(.exe)
  pdfium/
    pdfium.dll          # Windows
    libpdfium.so        # Linux
    libpdfium.dylib     # macOS
```
