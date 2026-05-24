mod clip;
mod extract;
mod pdfium_util;

use std::path::PathBuf;
use std::process;

use clap::{Parser, Subcommand, ValueEnum};

#[derive(Parser)]
#[command(name = "llm-wiki-native", about = "Native CLI tools for LLM Wiki")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Extract embedded images from PDF, DOCX, or PPTX files.
    ExtractImages {
        /// Input document path.
        #[arg(long)]
        input: PathBuf,

        /// Directory where extracted images are written.
        #[arg(long)]
        output_dir: PathBuf,

        /// Output format (currently only JSON is supported).
        #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
        format: OutputFormat,
    },

    /// Run the standalone web-clip HTTP server.
    ClipServer {
        /// TCP port to listen on.
        #[arg(long, default_value_t = 19827)]
        port: u16,

        /// Initial project path (can also be set via POST /project).
        #[arg(long)]
        project_path: Option<PathBuf>,
    },
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum OutputFormat {
    Json,
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::ExtractImages {
            input,
            output_dir,
            format,
        } => {
            if !matches!(format, OutputFormat::Json) {
                eprintln!("Unsupported output format");
                process::exit(1);
            }

            match extract::extract_images(&input, &output_dir, &extract::ExtractOptions::default())
            {
                Ok(images) => {
                    match serde_json::to_string_pretty(&images) {
                        Ok(json) => println!("{json}"),
                        Err(e) => {
                            eprintln!("Failed to serialize JSON: {e}");
                            process::exit(1);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("{e}");
                    process::exit(1);
                }
            }
        }
        Commands::ClipServer {
            port,
            project_path,
        } => {
            let initial = project_path.map(|p| p.to_string_lossy().replace('\\', "/"));
            clip::run_clip_server(port, initial);
        }
    }
}
