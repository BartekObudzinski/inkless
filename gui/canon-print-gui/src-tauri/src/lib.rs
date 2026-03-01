use std::path::Path;
use std::process::Command;
use serde::{Deserialize, Serialize};

// Input validation for printer names (alphanumeric, underscore, hyphen, max 127 chars)
fn is_valid_printer_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 127
        && !name.starts_with('-')
        && name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

// Input validation for IP addresses and hostnames
fn is_valid_host(host: &str) -> bool {
    if host.is_empty() || host.len() > 253 {
        return false;
    }
    // Allow: digits, letters, dots, hyphens, colons (for port)
    // Reject anything that could be shell metacharacters
    host.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == ':')
        && !host.starts_with('-')
        && !host.starts_with('.')
}

// Sanitize error messages to avoid leaking sensitive system info
fn sanitize_error(msg: &str) -> String {
    // Remove paths and keep only the relevant error message
    if msg.len() > 200 {
        format!("{}...", &msg[..200])
    } else {
        msg.to_string()
    }
}

#[derive(Serialize, Deserialize)]
pub struct ScanResult {
    port: u16,
    service: String,
    open: bool,
}

#[derive(Serialize, Deserialize)]
pub struct DiscoveredPrinter {
    name: String,
    uri: String,
    ip: String,
}

#[derive(Serialize, Deserialize)]
pub struct PrinterInfo {
    name: String,
    status: String,
    uri: String,
}

#[derive(Serialize, Deserialize)]
pub struct CommandResult {
    success: bool,
    message: String,
}

// Scan ports on a given IP
#[tauri::command]
fn scan_ports(ip: &str) -> Result<Vec<ScanResult>, String> {
    // Validate input
    if !is_valid_host(ip) {
        return Err("Invalid IP address or hostname".to_string());
    }

    let ports = vec![
        (631, "IPP"),
        (9100, "Raw/JetDirect"),
        (8611, "BJNP"),
        (515, "LPD"),
        (80, "HTTP"),
    ];

    let mut results = Vec::new();

    for (port, service) in ports {
        let addr_str = format!("{}:{}", ip, port);
        let open = match addr_str.parse() {
            Ok(addr) => std::net::TcpStream::connect_timeout(
                &addr,
                std::time::Duration::from_secs(2),
            )
            .is_ok(),
            Err(_) => false,
        };

        results.push(ScanResult {
            port,
            service: service.to_string(),
            open,
        });
    }

    Ok(results)
}

// Get list of configured CUPS printers
#[tauri::command]
fn get_printers() -> Vec<PrinterInfo> {
    let output = Command::new("lpstat")
        .args(["-p", "-d"])
        .output()
        .unwrap_or_else(|_| panic!("Failed to execute lpstat"));

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut printers = Vec::new();

    for line in stdout.lines() {
        if line.starts_with("printer ") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let name = parts[1].to_string();
                let status = if line.contains("idle") {
                    "idle"
                } else if line.contains("printing") {
                    "printing"
                } else {
                    "unknown"
                };

                // Get URI
                let uri_output = Command::new("lpstat")
                    .args(["-v", &name])
                    .output()
                    .ok();

                let uri = uri_output
                    .map(|o| {
                        String::from_utf8_lossy(&o.stdout)
                            .split_whitespace()
                            .last()
                            .unwrap_or("")
                            .to_string()
                    })
                    .unwrap_or_default();

                printers.push(PrinterInfo {
                    name,
                    status: status.to_string(),
                    uri,
                });
            }
        }
    }

    printers
}

// Add a printer to CUPS
#[tauri::command]
fn add_printer(name: &str, ip: &str) -> CommandResult {
    // Validate printer name
    if !is_valid_printer_name(name) {
        return CommandResult {
            success: false,
            message: "Invalid printer name. Use only letters, numbers, underscores, and hyphens.".to_string(),
        };
    }

    // Validate host
    let host = ip.trim();
    if !is_valid_host(host) {
        return CommandResult {
            success: false,
            message: "Invalid IP address or hostname.".to_string(),
        };
    }

    let uri = if host.contains(':') {
        format!("ipp://{}/ipp/print", host)
    } else {
        format!("ipp://{}:631/ipp/print", host)
    };

    let output = Command::new("lpadmin")
        .args(["-p", name, "-E", "-v", &uri, "-m", "everywhere"])
        .output();

    match output {
        Ok(o) => {
            if o.status.success() {
                CommandResult {
                    success: true,
                    message: format!("Printer '{}' added successfully", name),
                }
            } else {
                CommandResult {
                    success: false,
                    message: sanitize_error(&String::from_utf8_lossy(&o.stderr)),
                }
            }
        }
        Err(e) => CommandResult {
            success: false,
            message: sanitize_error(&e.to_string()),
        },
    }
}

// Print a file
#[tauri::command]
fn print_file(printer: &str, file_path: &str) -> CommandResult {
    // Validate printer name
    if !is_valid_printer_name(printer) {
        return CommandResult {
            success: false,
            message: "Invalid printer name.".to_string(),
        };
    }

    // Validate file path - must exist and be a regular file
    let path = Path::new(file_path);
    if !path.exists() {
        return CommandResult {
            success: false,
            message: "File does not exist.".to_string(),
        };
    }
    if !path.is_file() {
        return CommandResult {
            success: false,
            message: "Path is not a file.".to_string(),
        };
    }

    // Check file extension for allowed types
    let allowed_extensions = ["pdf", "jpg", "jpeg", "png", "txt", "gif", "bmp", "tiff"];
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());

    if !ext.map(|e| allowed_extensions.contains(&e.as_str())).unwrap_or(false) {
        return CommandResult {
            success: false,
            message: "File type not allowed for printing.".to_string(),
        };
    }

    // Prevent printing sensitive system files
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let path_str = canonical.to_string_lossy();
    let forbidden_paths = ["/etc", "/var", "/usr", "/bin", "/sbin", "/System", "/Library"];

    for forbidden in &forbidden_paths {
        if path_str.starts_with(forbidden) {
            return CommandResult {
                success: false,
                message: "Access to system files is not allowed.".to_string(),
            };
        }
    }

    let output = Command::new("lp")
        .args(["-d", printer, file_path])
        .output();

    match output {
        Ok(o) => {
            if o.status.success() {
                let stdout = String::from_utf8_lossy(&o.stdout);
                CommandResult {
                    success: true,
                    message: stdout.to_string(),
                }
            } else {
                CommandResult {
                    success: false,
                    message: sanitize_error(&String::from_utf8_lossy(&o.stderr)),
                }
            }
        }
        Err(e) => CommandResult {
            success: false,
            message: sanitize_error(&e.to_string()),
        },
    }
}

// Remove a printer
#[tauri::command]
fn remove_printer(name: &str) -> CommandResult {
    // Validate printer name
    if !is_valid_printer_name(name) {
        return CommandResult {
            success: false,
            message: "Invalid printer name.".to_string(),
        };
    }

    let output = Command::new("lpadmin")
        .args(["-x", name])
        .output();

    match output {
        Ok(o) => {
            if o.status.success() {
                CommandResult {
                    success: true,
                    message: format!("Printer '{}' removed", name),
                }
            } else {
                CommandResult {
                    success: false,
                    message: sanitize_error(&String::from_utf8_lossy(&o.stderr)),
                }
            }
        }
        Err(e) => CommandResult {
            success: false,
            message: sanitize_error(&e.to_string()),
        },
    }
}

// Auto-discover printers using ippfind (macOS built-in)
#[tauri::command]
fn discover_printers() -> Vec<DiscoveredPrinter> {
    // Use ippfind to discover IPP printers with name and URI in one call
    let output = Command::new("ippfind")
        .args(["-T", "3", "-x", "echo", "{service_name}|{}", ";"])
        .output();

    let mut printers = Vec::new();

    if let Ok(o) = output {
        let stdout = String::from_utf8_lossy(&o.stdout);

        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            // Format: "Canon G3010 series|ipp://BC2FCD000000.local:631/ipp/print"
            let parts: Vec<&str> = line.splitn(2, '|').collect();
            if parts.len() != 2 {
                continue;
            }

            let name = parts[0].trim();
            let uri = parts[1].trim();

            // Extract host from URI: ipp://HOST:631/...
            let host = uri
                .split("://")
                .nth(1)
                .and_then(|s| s.split(':').next())
                .unwrap_or("");

            if host.is_empty() {
                continue;
            }

            printers.push(DiscoveredPrinter {
                name: name.to_string(),
                uri: uri.to_string(),
                ip: host.to_string(),
            });
        }
    }

    printers
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_ports,
            get_printers,
            add_printer,
            print_file,
            remove_printer,
            discover_printers
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
