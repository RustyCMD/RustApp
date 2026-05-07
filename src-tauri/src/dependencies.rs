//! Sanity-check that an Oxide install has the DLLs it needs.
//!
//! This is intentionally a small, hardcoded list — full dependency graphs
//! belong to Oxide itself. The point here is to flag obviously-broken
//! installs (e.g. user manually deleted `Newtonsoft.Json.dll` while
//! cleaning a folder).

use tokio::fs;

use crate::error::Result;
use crate::models::DependencyStatus;
use crate::utils::managed_dir;

/// DLLs that uMod / Oxide and most plugins assume are present in the
/// `RustDedicated_Data/Managed/` folder of a working server.
pub const REQUIRED_DLLS: &[&str] = &[
    "Newtonsoft.Json.dll",
    "Oxide.Core.dll",
    "Oxide.Rust.dll",
    "Oxide.References.dll",
    "Oxide.CSharp.dll",
    "Assembly-CSharp.dll",
    "UnityEngine.dll",
];

pub async fn check_common_dependencies(server_dir: &str) -> Result<DependencyStatus> {
    let dir = managed_dir(server_dir);
    let dir_str = dir.to_string_lossy().into_owned();

    if !dir.exists() {
        return Ok(DependencyStatus {
            managed_dir: dir_str,
            present: vec![],
            missing: REQUIRED_DLLS.iter().map(|s| (*s).to_string()).collect(),
        });
    }

    let mut found = Vec::new();
    let mut rd = fs::read_dir(&dir).await?;
    while let Some(entry) = rd.next_entry().await? {
        if let Some(name) = entry.file_name().to_str() {
            found.push(name.to_string());
        }
    }
    let lower: Vec<String> = found.iter().map(|s| s.to_lowercase()).collect();

    let mut present = Vec::new();
    let mut missing = Vec::new();
    for dll in REQUIRED_DLLS {
        if lower.iter().any(|n| n == &dll.to_lowercase()) {
            present.push((*dll).to_string());
        } else {
            missing.push((*dll).to_string());
        }
    }

    Ok(DependencyStatus {
        managed_dir: dir_str,
        present,
        missing,
    })
}
