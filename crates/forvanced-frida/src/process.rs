use serde::{Deserialize, Serialize};

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
