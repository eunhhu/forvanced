use serde::{Deserialize, Serialize};

/// Process information from Frida
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<Vec<u8>>,
}

impl ProcessInfo {
    pub fn new(pid: u32, name: impl Into<String>) -> Self {
        Self {
            pid,
            name: name.into(),
            path: None,
            icon: None,
        }
    }

    pub fn with_path(mut self, path: impl Into<String>) -> Self {
        self.path = Some(path.into());
        self
    }
}

/// Application information for mobile devices
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplicationInfo {
    /// Bundle identifier (e.g., "com.example.app")
    pub identifier: String,
    /// Display name (e.g., "Example App")
    pub name: String,
    /// Process ID if running (None if not running)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<Vec<u8>>,
}

impl ApplicationInfo {
    pub fn new(identifier: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            identifier: identifier.into(),
            name: name.into(),
            pid: None,
            icon: None,
        }
    }

    pub fn with_pid(mut self, pid: u32) -> Self {
        self.pid = Some(pid);
        self
    }
}

/// Target specification for attach operations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum AttachTarget {
    /// Attach by process ID
    Pid(u32),
    /// Attach by process name (e.g., "Safari", "chrome.exe")
    Name(String),
    /// Attach by bundle identifier (e.g., "com.apple.Safari", "com.example.app")
    Identifier(String),
}

impl std::fmt::Display for AttachTarget {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AttachTarget::Pid(pid) => write!(f, "pid:{}", pid),
            AttachTarget::Name(name) => write!(f, "name:{}", name),
            AttachTarget::Identifier(id) => write!(f, "identifier:{}", id),
        }
    }
}

/// Spawn options for launching an application
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SpawnOptions {
    /// Arguments to pass to the spawned process
    #[serde(default)]
    pub argv: Vec<String>,
    /// Environment variables
    #[serde(default)]
    pub envp: Vec<String>,
    /// Working directory
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    /// Standard I/O handling
    #[serde(default)]
    pub stdio: StdioMode,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum StdioMode {
    #[default]
    Inherit,
    Pipe,
}

/// Device type enum matching Frida's DeviceType
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FridaDeviceType {
    Local,
    Remote,
    Usb,
}

impl std::fmt::Display for FridaDeviceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FridaDeviceType::Local => write!(f, "local"),
            FridaDeviceType::Remote => write!(f, "remote"),
            FridaDeviceType::Usb => write!(f, "usb"),
        }
    }
}

/// Information about a Frida device
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    /// Unique device ID (from Frida)
    pub id: String,
    /// Human-readable device name
    pub name: String,
    /// Device type (local, usb, remote)
    pub device_type: FridaDeviceType,
}

impl DeviceInfo {
    pub fn new(id: impl Into<String>, name: impl Into<String>, device_type: FridaDeviceType) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            device_type,
        }
    }
}
