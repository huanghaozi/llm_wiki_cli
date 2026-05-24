//! Minimal PDFium initialization for standalone CLI use.
//!
//! Adapted from `src-tauri/src/commands/fs.rs` — resolves the dynamic
//! library relative to the executable and via `PDFIUM_DYNAMIC_LIB_PATH`.

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

static PDFIUM: OnceLock<Result<pdfium_render::prelude::Pdfium, String>> = OnceLock::new();

/// Serializes every PDFium call. PDFium's C library is not safe for
/// concurrent access from multiple threads.
static PDFIUM_LOCK: Mutex<()> = Mutex::new(());

/// Optional resource directory hint (e.g. set via env `LLM_WIKI_NATIVE_RESOURCE_DIR`).
static RESOURCE_DIR_HINT: OnceLock<PathBuf> = OnceLock::new();

/// Set a resource directory hint for locating bundled pdfium libraries.
pub fn set_resource_dir_hint(dir: PathBuf) {
    let _ = RESOURCE_DIR_HINT.set(dir);
}

fn init_resource_dir_hint() {
    if RESOURCE_DIR_HINT.get().is_some() {
        return;
    }
    if let Ok(dir) = std::env::var("LLM_WIKI_NATIVE_RESOURCE_DIR") {
        let _ = RESOURCE_DIR_HINT.set(PathBuf::from(dir));
    }
}

/// Acquire the PDFium serialization lock.
pub fn lock_pdfium() -> std::sync::MutexGuard<'static, ()> {
    PDFIUM_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn push_candidate(v: &mut Vec<String>, p: PathBuf) {
    v.push(p.to_string_lossy().into_owned());
}

fn pdfium_candidate_paths() -> Vec<String> {
    init_resource_dir_hint();
    let mut v: Vec<String> = Vec::new();

    if let Ok(p) = std::env::var("PDFIUM_DYNAMIC_LIB_PATH") {
        v.push(p);
    }

    if let Some(resource_dir) = RESOURCE_DIR_HINT.get() {
        #[cfg(target_os = "macos")]
        {
            push_candidate(&mut v, resource_dir.join("pdfium").join("libpdfium.dylib"));
            push_candidate(&mut v, resource_dir.join("libpdfium.dylib"));
        }
        #[cfg(target_os = "windows")]
        {
            push_candidate(&mut v, resource_dir.join("pdfium").join("pdfium.dll"));
            push_candidate(&mut v, resource_dir.join("pdfium").join("libpdfium.dll"));
            push_candidate(&mut v, resource_dir.join("pdfium.dll"));
            push_candidate(&mut v, resource_dir.join("libpdfium.dll"));
        }
        #[cfg(target_os = "linux")]
        {
            push_candidate(&mut v, resource_dir.join("pdfium").join("libpdfium.so"));
            push_candidate(&mut v, resource_dir.join("libpdfium.so"));
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            #[cfg(target_os = "macos")]
            {
                push_candidate(&mut v, exe_dir.join("pdfium").join("libpdfium.dylib"));
                push_candidate(&mut v, exe_dir.join("libpdfium.dylib"));
            }

            #[cfg(target_os = "windows")]
            {
                push_candidate(&mut v, exe_dir.join("pdfium.dll"));
                push_candidate(&mut v, exe_dir.join("pdfium").join("pdfium.dll"));
                push_candidate(&mut v, exe_dir.join("libpdfium.dll"));
                push_candidate(&mut v, exe_dir.join("resources").join("pdfium.dll"));
                push_candidate(
                    &mut v,
                    exe_dir.join("resources").join("pdfium").join("pdfium.dll"),
                );
            }

            #[cfg(target_os = "linux")]
            {
                push_candidate(&mut v, exe_dir.join("libpdfium.so"));
                push_candidate(&mut v, exe_dir.join("pdfium").join("libpdfium.so"));
                push_candidate(&mut v, exe_dir.join("resources").join("libpdfium.so"));
                push_candidate(
                    &mut v,
                    exe_dir
                        .join("resources")
                        .join("pdfium")
                        .join("libpdfium.so"),
                );
            }
        }
    }

    v
}

pub fn pdfium() -> Result<&'static pdfium_render::prelude::Pdfium, String> {
    PDFIUM
        .get_or_init(|| {
            use pdfium_render::prelude::*;
            let candidates = pdfium_candidate_paths();
            for path in &candidates {
                if let Ok(bindings) = Pdfium::bind_to_library(path) {
                    eprintln!("[pdfium] loaded dynamic library from {path}");
                    return Ok(Pdfium::new(bindings));
                }
            }
            Pdfium::bind_to_system_library()
                .map(Pdfium::new)
                .map_err(|e| {
                    format!(
                        "Failed to locate Pdfium library. Tried: {} — and the system search path. Last error: {e}",
                        if candidates.is_empty() {
                            "(no candidates)".to_string()
                        } else {
                            candidates.join(", ")
                        }
                    )
                })
        })
        .as_ref()
        .map_err(|e| e.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_pdfium_can_be_acquired() {
        let _guard = lock_pdfium();
    }

    #[test]
    fn pdfium_candidate_paths_includes_env_override() {
        std::env::set_var("PDFIUM_DYNAMIC_LIB_PATH", "/tmp/custom/pdfium.so");
        let paths = pdfium_candidate_paths();
        assert!(paths.first().map(|p| p.as_str()) == Some("/tmp/custom/pdfium.so"));
        std::env::remove_var("PDFIUM_DYNAMIC_LIB_PATH");
    }
}
