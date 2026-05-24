//! Image extraction from PDF / PPTX / DOCX for the standalone CLI.
//!
//! Adapted from `src-tauri/src/commands/extract_images.rs` without Tauri
//! dependencies. Images are written to disk and returned as metadata JSON.

use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::Path;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::pdfium_util;

#[derive(Debug, Clone)]
pub struct ExtractOptions {
    pub min_width: u32,
    pub min_height: u32,
    pub max_images: usize,
}

impl Default for ExtractOptions {
    fn default() -> Self {
        Self {
            min_width: 100,
            min_height: 100,
            max_images: 500,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedImage {
    pub index: u32,
    pub mime_type: String,
    pub page: Option<u32>,
    pub width: u32,
    pub height: u32,
    pub file_path: String,
    pub sha256: String,
}

/// Extract images from a PDF, PPTX, or DOCX file and write them to `output_dir`.
pub fn extract_images(
    input: &Path,
    output_dir: &Path,
    options: &ExtractOptions,
) -> Result<Vec<ExtractedImage>, String> {
    if !input.is_file() {
        return Err(format!("Input file does not exist: '{}'", input.display()));
    }

    std::fs::create_dir_all(output_dir)
        .map_err(|e| format!("Failed to create output dir '{}': {e}", output_dir.display()))?;

    let ext = input
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match ext.as_str() {
        "pdf" => extract_and_save_pdf_images(input, output_dir, options),
        "pptx" | "docx" => extract_and_save_office_images(input, output_dir, options),
        other => Err(format!(
            "Unsupported file type '.{other}'. Supported: pdf, pptx, docx"
        )),
    }
}

fn extract_and_save_pdf_images(
    path: &Path,
    dest_dir: &Path,
    options: &ExtractOptions,
) -> Result<Vec<ExtractedImage>, String> {
    use pdfium_render::prelude::*;

    let path_str = path.to_string_lossy();
    let _guard = pdfium_util::lock_pdfium();
    let pdfium = pdfium_util::pdfium()?;
    let doc = pdfium
        .load_pdf_from_file(path_str.as_ref(), None)
        .map_err(|e| format!("Failed to open PDF '{}': {e}", path.display()))?;

    let mut out: Vec<ExtractedImage> = Vec::new();
    let mut idx: u32 = 0;

    'pages: for (page_idx, page) in doc.pages().iter().enumerate() {
        for object in page.objects().iter() {
            let image = match object.as_image_object() {
                Some(img) => img,
                None => continue,
            };

            let dyn_img = match image.get_raw_image() {
                Ok(b) => b,
                Err(e) => {
                    eprintln!(
                        "[extract_pdf] page {} image read failed: {e}",
                        page_idx + 1
                    );
                    continue;
                }
            };

            let width = dyn_img.width();
            let height = dyn_img.height();
            if width < options.min_width || height < options.min_height {
                continue;
            }

            let mut png_bytes: Vec<u8> = Vec::new();
            if let Err(e) = dyn_img.write_to(
                &mut std::io::Cursor::new(&mut png_bytes),
                image::ImageFormat::Png,
            ) {
                eprintln!(
                    "[extract_pdf] page {} PNG encode failed: {e}",
                    page_idx + 1
                );
                continue;
            }

            idx += 1;
            let file_name = format!("img-{idx}.png");
            let file_path = save_one_image(&png_bytes, dest_dir, &file_name)?;
            let sha256 = sha256_hex(&png_bytes);

            out.push(ExtractedImage {
                index: idx,
                mime_type: "image/png".to_string(),
                page: Some((page_idx + 1) as u32),
                width,
                height,
                file_path,
                sha256,
            });

            if out.len() >= options.max_images {
                eprintln!(
                    "[extract_pdf] reached max_images={} cap; skipped rest",
                    options.max_images
                );
                break 'pages;
            }
        }
    }

    Ok(out)
}

fn extract_and_save_office_images(
    path: &Path,
    dest_dir: &Path,
    options: &ExtractOptions,
) -> Result<Vec<ExtractedImage>, String> {
    let path_str = path.to_string_lossy();
    let file = File::open(path).map_err(|e| format!("Failed to open '{path_str}': {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip '{path_str}': {e}"))?;

    let is_pptx = archive
        .file_names()
        .any(|n| n == "ppt/presentation.xml" || n.starts_with("ppt/slides/slide"));
    let media_to_slide = if is_pptx {
        build_pptx_media_slide_map(&mut archive)
    } else {
        HashMap::new()
    };

    let media_indices: Vec<usize> = (0..archive.len())
        .filter(|i| {
            archive
                .by_index_raw(*i)
                .ok()
                .map(|f| is_media_path(f.name()))
                .unwrap_or(false)
        })
        .collect();

    let mut out: Vec<ExtractedImage> = Vec::new();
    let mut idx: u32 = 0;

    for archive_idx in media_indices {
        let mut entry = match archive.by_index(archive_idx) {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[extract_office] zip entry {archive_idx} read failed: {e}");
                continue;
            }
        };

        let entry_name = entry.name().to_string();
        let mime_type = match guess_mime_from_name(&entry_name) {
            Some(m) => m,
            None => continue,
        };

        let mut bytes = Vec::with_capacity(entry.size() as usize);
        if let Err(e) = entry.read_to_end(&mut bytes) {
            eprintln!("[extract_office] read '{entry_name}' failed: {e}");
            continue;
        }

        let (width, height) = match image::load_from_memory(&bytes) {
            Ok(img) => (img.width(), img.height()),
            Err(e) => {
                eprintln!("[extract_office] decode '{entry_name}' failed: {e}");
                continue;
            }
        };
        if width < options.min_width || height < options.min_height {
            continue;
        }

        idx += 1;
        let ext = ext_for_mime(&mime_type);
        let file_name = format!("img-{idx}.{ext}");
        let file_path = save_one_image(&bytes, dest_dir, &file_name)?;
        let sha256 = sha256_hex(&bytes);
        let page = media_to_slide.get(&entry_name).copied().flatten();

        out.push(ExtractedImage {
            index: idx,
            mime_type,
            page,
            width,
            height,
            file_path,
            sha256,
        });

        if out.len() >= options.max_images {
            eprintln!(
                "[extract_office] reached max_images={} cap; skipped rest",
                options.max_images
            );
            break;
        }
    }

    Ok(out)
}

fn save_one_image(bytes: &[u8], dest_dir: &Path, file_name: &str) -> Result<String, String> {
    let abs = dest_dir.join(file_name);
    std::fs::write(&abs, bytes).map_err(|e| format!("write '{}': {e}", abs.display()))?;
    Ok(normalize_path(&abs))
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn is_media_path(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.starts_with("ppt/media/")
        || lower.starts_with("word/media/")
        || lower.starts_with("xl/media/")
}

pub fn guess_mime_from_name(name: &str) -> Option<String> {
    let ext = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())?
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png".to_string()),
        "jpg" | "jpeg" => Some("image/jpeg".to_string()),
        "gif" => Some("image/gif".to_string()),
        "webp" => Some("image/webp".to_string()),
        "bmp" => Some("image/bmp".to_string()),
        _ => None,
    }
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex_encode(&hasher.finalize())
}

pub fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

fn ext_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        _ => "bin",
    }
}

fn build_pptx_media_slide_map(
    archive: &mut zip::ZipArchive<File>,
) -> HashMap<String, Option<u32>> {
    let mut out: HashMap<String, Option<u32>> = HashMap::new();

    let rels_paths: Vec<String> = archive
        .file_names()
        .filter(|n| n.starts_with("ppt/slides/_rels/slide") && n.ends_with(".xml.rels"))
        .map(String::from)
        .collect();

    for rels_path in rels_paths {
        let slide_num: Option<u32> = rels_path
            .strip_prefix("ppt/slides/_rels/slide")
            .and_then(|s| s.strip_suffix(".xml.rels"))
            .and_then(|s| s.parse().ok());

        let mut entry = match archive.by_name(&rels_path) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let mut xml = String::new();
        if entry.read_to_string(&mut xml).is_err() {
            continue;
        }

        let mut search_from = 0;
        while let Some(pos) = xml[search_from..].find("Target=\"") {
            let start = search_from + pos + "Target=\"".len();
            let end = match xml[start..].find('"') {
                Some(e) => start + e,
                None => break,
            };
            let target = &xml[start..end];
            search_from = end + 1;

            if let Some(stripped) = target.strip_prefix("../") {
                let canonical = format!("ppt/{stripped}");
                if is_media_path(&canonical) {
                    out.insert(canonical, slide_num);
                }
            }
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn is_media_path_recognizes_pptx_docx_xlsx() {
        assert!(is_media_path("ppt/media/image1.png"));
        assert!(is_media_path("word/media/image2.jpeg"));
        assert!(is_media_path("xl/media/image3.gif"));
        assert!(!is_media_path("ppt/slides/slide1.xml"));
        assert!(!is_media_path("word/document.xml"));
    }

    #[test]
    fn guess_mime_from_name_covers_common_formats() {
        assert_eq!(
            guess_mime_from_name("ppt/media/image1.PNG"),
            Some("image/png".to_string())
        );
        assert_eq!(
            guess_mime_from_name("word/media/image2.jpeg"),
            Some("image/jpeg".to_string())
        );
        assert_eq!(guess_mime_from_name("ppt/media/foo.svg"), None);
    }

    #[test]
    fn sha256_hex_is_deterministic_and_64_chars() {
        let h1 = sha256_hex(b"hello world");
        let h2 = sha256_hex(b"hello world");
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64);
        assert_eq!(
            h1,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    #[test]
    fn ext_for_mime_maps_known_types() {
        assert_eq!(ext_for_mime("image/png"), "png");
        assert_eq!(ext_for_mime("image/jpeg"), "jpg");
        assert_eq!(ext_for_mime("image/unknown"), "bin");
    }

    #[test]
    fn extract_options_defaults_match_plan() {
        let o = ExtractOptions::default();
        assert_eq!(o.min_width, 100);
        assert_eq!(o.min_height, 100);
        assert_eq!(o.max_images, 500);
    }

    #[test]
    fn normalize_path_uses_forward_slashes() {
        let p = PathBuf::from(r"C:\foo\bar\img-1.png");
        assert_eq!(normalize_path(&p), "C:/foo/bar/img-1.png");
    }
}
