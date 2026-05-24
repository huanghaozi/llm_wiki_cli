//! Standalone HTTP clip server for web clipping.
//!
//! Adapted from `src-tauri/src/clip_server.rs` without Tauri dependencies.

use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tiny_http::{Header, Method, Response, Server};

static CURRENT_PROJECT: Mutex<String> = Mutex::new(String::new());
static ALL_PROJECTS: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());
static PENDING_CLIPS: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());

/// Daemon status: 0=starting, 1=running, 2=port_conflict, 3=error
static DAEMON_STATUS: AtomicU8 = AtomicU8::new(0);

const MAX_BIND_RETRIES: u32 = 3;
const MAX_RESTART_RETRIES: u32 = 10;
const BIND_RETRY_DELAY_SECS: u64 = 2;
const RESTART_DELAY_SECS: u64 = 5;

pub fn get_daemon_status() -> &'static str {
    match DAEMON_STATUS.load(Ordering::Relaxed) {
        0 => "starting",
        1 => "running",
        2 => "port_conflict",
        _ => "error",
    }
}

pub fn set_current_project(path: String) {
    if let Ok(mut guard) = CURRENT_PROJECT.lock() {
        *guard = path.replace('\\', "/");
    }
}

pub fn current_project_path() -> String {
    CURRENT_PROJECT
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or_default()
}

pub fn all_projects() -> Vec<(String, String)> {
    ALL_PROJECTS
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or_default()
}

/// Run the clip server on the given port until the process exits.
/// Blocks the calling thread.
pub fn run_clip_server(port: u16, initial_project_path: Option<String>) {
    if let Some(path) = initial_project_path {
        set_current_project(path);
    }

    let mut restart_count: u32;

    loop {
        let server = {
            let mut last_err = String::new();
            let mut bound = None;
            for attempt in 1..=MAX_BIND_RETRIES {
                match Server::http(format!("127.0.0.1:{port}")) {
                    Ok(s) => {
                        bound = Some(s);
                        break;
                    }
                    Err(e) => {
                        last_err = format!("{e}");
                        eprintln!(
                            "[Clip Server] Bind attempt {attempt}/{MAX_BIND_RETRIES} failed: {e}"
                        );
                        if attempt < MAX_BIND_RETRIES {
                            thread::sleep(Duration::from_secs(BIND_RETRY_DELAY_SECS));
                        }
                    }
                }
            }
            match bound {
                Some(s) => s,
                None => {
                    eprintln!(
                        "[Clip Server] Port {port} unavailable after {MAX_BIND_RETRIES} attempts: {last_err}"
                    );
                    DAEMON_STATUS.store(2, Ordering::Relaxed);
                    std::process::exit(1);
                }
            }
        };

        DAEMON_STATUS.store(1, Ordering::Relaxed);
        restart_count = 0;
        eprintln!("[Clip Server] Listening on http://127.0.0.1:{port}");

        for mut request in server.incoming_requests() {
            let cors_headers = vec![
                Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap(),
                Header::from_bytes("Access-Control-Allow-Methods", "GET, POST, OPTIONS").unwrap(),
                Header::from_bytes("Access-Control-Allow-Headers", "Content-Type").unwrap(),
                Header::from_bytes("Content-Type", "application/json").unwrap(),
            ];

            if request.method() == &Method::Options {
                let mut response = Response::from_string("").with_status_code(204);
                for h in &cors_headers {
                    response.add_header(h.clone());
                }
                let _ = request.respond(response);
                continue;
            }

            let url = request.url().to_string();

            match (request.method(), url.as_str()) {
                (&Method::Get, "/status") => {
                    let body = r#"{"ok":true,"version":"0.1.0"}"#;
                    let mut response = Response::from_string(body);
                    for h in &cors_headers {
                        response.add_header(h.clone());
                    }
                    let _ = request.respond(response);
                }
                (&Method::Get, "/project") => {
                    let path = CURRENT_PROJECT.lock().unwrap().clone();
                    let body = serde_json::json!({
                        "ok": true,
                        "path": path,
                    })
                    .to_string();
                    let mut response = Response::from_string(body);
                    for h in &cors_headers {
                        response.add_header(h.clone());
                    }
                    let _ = request.respond(response);
                }
                (&Method::Post, "/project") => {
                    let mut body = String::new();
                    if let Err(e) = request.as_reader().read_to_string(&mut body) {
                        let err = serde_json::json!({
                            "ok": false,
                            "error": format!("Failed to read body: {e}"),
                        })
                        .to_string();
                        let mut response = Response::from_string(err).with_status_code(400);
                        for h in &cors_headers {
                            response.add_header(h.clone());
                        }
                        let _ = request.respond(response);
                        continue;
                    }

                    let result = handle_set_project(&body);
                    let status = if result.contains(r#""ok":true"#) {
                        200
                    } else {
                        400
                    };
                    let mut response = Response::from_string(result).with_status_code(status);
                    for h in &cors_headers {
                        response.add_header(h.clone());
                    }
                    let _ = request.respond(response);
                }
                (&Method::Get, "/projects") => {
                    let projects = ALL_PROJECTS.lock().unwrap().clone();
                    let current = CURRENT_PROJECT.lock().unwrap().clone();
                    let items: Vec<serde_json::Value> = projects
                        .iter()
                        .map(|(name, path)| {
                            serde_json::json!({
                                "name": name,
                                "path": path,
                                "current": path == &current,
                            })
                        })
                        .collect();
                    let body = serde_json::json!({
                        "ok": true,
                        "projects": items,
                    })
                    .to_string();
                    let mut response = Response::from_string(body);
                    for h in &cors_headers {
                        response.add_header(h.clone());
                    }
                    let _ = request.respond(response);
                }
                (&Method::Post, "/projects") => {
                    let mut body = String::new();
                    if request.as_reader().read_to_string(&mut body).is_ok() {
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&body) {
                            if let Some(arr) = parsed["projects"].as_array() {
                                let mut projects = ALL_PROJECTS.lock().unwrap();
                                projects.clear();
                                for item in arr {
                                    let name = item["name"].as_str().unwrap_or("").to_string();
                                    let path = item["path"].as_str().unwrap_or("").to_string();
                                    if !path.is_empty() {
                                        projects.push((name, path));
                                    }
                                }
                            }
                        }
                    }
                    let mut response = Response::from_string(r#"{"ok":true}"#);
                    for h in &cors_headers {
                        response.add_header(h.clone());
                    }
                    let _ = request.respond(response);
                }
                (&Method::Get, "/clips/pending") => {
                    let mut pending = PENDING_CLIPS.lock().unwrap();
                    let clips_json: Vec<serde_json::Value> = pending
                        .iter()
                        .map(|(proj, file)| {
                            serde_json::json!({
                                "projectPath": proj,
                                "filePath": file,
                            })
                        })
                        .collect();
                    let body = serde_json::json!({
                        "ok": true,
                        "clips": clips_json,
                    })
                    .to_string();
                    pending.clear();
                    let mut response = Response::from_string(body);
                    for h in &cors_headers {
                        response.add_header(h.clone());
                    }
                    let _ = request.respond(response);
                }
                (&Method::Post, "/clip") => {
                    let mut body = String::new();
                    if let Err(e) = request.as_reader().read_to_string(&mut body) {
                        let err = serde_json::json!({
                            "ok": false,
                            "error": format!("Failed to read body: {e}"),
                        })
                        .to_string();
                        let mut response = Response::from_string(err).with_status_code(400);
                        for h in &cors_headers {
                            response.add_header(h.clone());
                        }
                        let _ = request.respond(response);
                        continue;
                    }

                    let result = handle_clip(&body);
                    let status = if result.contains(r#""ok":true"#) {
                        200
                    } else {
                        500
                    };
                    let mut response = Response::from_string(result).with_status_code(status);
                    for h in &cors_headers {
                        response.add_header(h.clone());
                    }
                    let _ = request.respond(response);
                }
                _ => {
                    let mut response =
                        Response::from_string(r#"{"ok":false,"error":"Not found"}"#)
                            .with_status_code(404);
                    for h in &cors_headers {
                        response.add_header(h.clone());
                    }
                    let _ = request.respond(response);
                }
            }
        }

        DAEMON_STATUS.store(3, Ordering::Relaxed);
        restart_count += 1;

        if restart_count >= MAX_RESTART_RETRIES {
            eprintln!(
                "[Clip Server] Exceeded max restarts ({MAX_RESTART_RETRIES}). Giving up."
            );
            std::process::exit(1);
        }

        eprintln!(
            "[Clip Server] Crashed. Restarting in {RESTART_DELAY_SECS}s (attempt {restart_count}/{MAX_RESTART_RETRIES})"
        );
        thread::sleep(Duration::from_secs(RESTART_DELAY_SECS));
    }
}

fn handle_set_project(body: &str) -> String {
    let parsed: serde_json::Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(e) => {
            return serde_json::json!({
                "ok": false,
                "error": format!("Invalid JSON: {e}"),
            })
            .to_string();
        }
    };

    let path = match parsed["path"].as_str() {
        Some(p) => p.replace('\\', "/"),
        None => {
            return serde_json::json!({
                "ok": false,
                "error": "path field is required",
            })
            .to_string();
        }
    };

    match CURRENT_PROJECT.lock() {
        Ok(mut guard) => {
            *guard = path;
            r#"{"ok":true}"#.to_string()
        }
        Err(e) => {
            serde_json::json!({
                "ok": false,
                "error": format!("Lock error: {e}"),
            })
            .to_string()
        }
    }
}

fn handle_clip(body: &str) -> String {
    let parsed: serde_json::Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(e) => {
            return serde_json::json!({
                "ok": false,
                "error": format!("Invalid JSON: {e}"),
            })
            .to_string();
        }
    };

    let title = parsed["title"].as_str().unwrap_or("Untitled");
    let url = parsed["url"].as_str().unwrap_or("");
    let content = parsed["content"].as_str().unwrap_or("");

    let project_path_from_body = parsed["projectPath"].as_str().unwrap_or("").to_string();
    let project_path = if project_path_from_body.is_empty() {
        match CURRENT_PROJECT.lock() {
            Ok(guard) => guard.clone(),
            Err(e) => {
                return serde_json::json!({
                    "ok": false,
                    "error": format!("Lock error: {e}"),
                })
                .to_string();
            }
        }
    } else {
        project_path_from_body
    };
    let project_path = project_path.replace('\\', "/");

    if project_path.is_empty() {
        return serde_json::json!({
            "ok": false,
            "error": "projectPath is required (set via POST /project or include in request body)",
        })
        .to_string();
    }

    if content.is_empty() {
        return serde_json::json!({
            "ok": false,
            "error": "content is required",
        })
        .to_string();
    }

    let (date, date_compact) = local_date_strings();

    let slug_raw: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' {
                c
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
        .to_lowercase();
    let slug: String = slug_raw.chars().take(50).collect();

    let base_name = format!("{slug}-{date_compact}");
    let dir_path = std::path::Path::new(&project_path)
        .join("raw")
        .join("sources");

    if let Err(e) = std::fs::create_dir_all(&dir_path) {
        return serde_json::json!({
            "ok": false,
            "error": format!("Failed to create directory: {e}"),
        })
        .to_string();
    }

    let mut file_path = dir_path.join(format!("{base_name}.md"));
    let mut counter = 2u32;
    while file_path.exists() {
        file_path = dir_path.join(format!("{base_name}-{counter}.md"));
        counter += 1;
    }
    let file_path = file_path.to_string_lossy().replace('\\', "/");

    let markdown = format!(
        "---\ntype: clip\ntitle: \"{}\"\nurl: \"{}\"\nclipped: {}\norigin: web-clip\nsources: []\ntags: [web-clip]\n---\n\n# {}\n\nSource: {}\n\n{}\n",
        title.replace('"', r#"\""#),
        url.replace('"', r#"\""#),
        date,
        title,
        url,
        content,
    );

    if let Err(e) = std::fs::write(&file_path, &markdown) {
        return serde_json::json!({
            "ok": false,
            "error": format!("Failed to write file: {e}"),
        })
        .to_string();
    }

    let relative_path = {
        let full = std::path::Path::new(&file_path);
        let base = std::path::Path::new(&project_path);
        full.strip_prefix(base)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| file_path.clone())
    };

    if let Ok(mut pending) = PENDING_CLIPS.lock() {
        pending.push((project_path, file_path.clone()));
    }

    serde_json::json!({
        "ok": true,
        "path": relative_path,
    })
    .to_string()
}

/// Returns `(YYYY-MM-DD, YYYYMMDD)` in UTC without external date crates.
pub fn local_date_strings() -> (String, String) {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let (y, m, d) = epoch_to_ymd(secs);
    (
        format!("{y:04}-{m:02}-{d:02}"),
        format!("{y:04}{m:02}{d:02}"),
    )
}

fn epoch_to_ymd(secs: i64) -> (i32, u32, u32) {
    let days = secs.div_euclid(86_400);
    let z = days + 719_468;
    let era = (if z >= 0 { z } else { z - 146_097 }) / 146_097;
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i32 + era as i32 * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    (year, m, d)
}

pub fn slugify_title(title: &str) -> String {
    let slug_raw: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' {
                c
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
        .to_lowercase();
    slug_raw.chars().take(50).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_title_normalizes_and_truncates() {
        assert_eq!(slugify_title("Hello World!"), "hello-world");
        let long = "a".repeat(80);
        assert_eq!(slugify_title(&long).len(), 50);
    }

    #[test]
    fn epoch_to_ymd_unix_epoch() {
        let (y, m, d) = epoch_to_ymd(0);
        assert_eq!((y, m, d), (1970, 1, 1));
    }

    #[test]
    fn epoch_to_ymd_known_date() {
        // 2024-01-15 00:00:00 UTC
        let (y, m, d) = epoch_to_ymd(1_705_276_800);
        assert_eq!((y, m, d), (2024, 1, 15));
    }

    #[test]
    fn local_date_strings_format() {
        let (iso, compact) = local_date_strings();
        assert_eq!(iso.len(), 10);
        assert_eq!(compact.len(), 8);
        assert!(iso.contains('-'));
        assert!(compact.chars().all(|c| c.is_ascii_digit()));
    }

    #[test]
    fn handle_set_project_requires_path() {
        let result = handle_set_project("{}");
        assert!(result.contains(r#""ok":false"#));
        assert!(result.contains("path field is required"));
    }

    #[test]
    fn handle_set_project_accepts_path() {
        let result = handle_set_project(r#"{"path":"C:\\Projects\\demo"}"#);
        assert!(result.contains(r#""ok":true"#));
        assert_eq!(current_project_path(), "C:/Projects/demo");
    }
}
