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

#[cfg(test)]
mod tests {
    use super::*;

    // --- ProcessInfo ---

    #[test]
    fn test_process_info_new() {
        let p = ProcessInfo::new(1234, "my_process");
        assert_eq!(p.pid, 1234);
        assert_eq!(p.name, "my_process");
        assert!(p.path.is_none());
        assert!(p.icon.is_none());
    }

    #[test]
    fn test_process_info_with_path() {
        let p = ProcessInfo::new(100, "test").with_path("/usr/bin/test");
        assert_eq!(p.path, Some("/usr/bin/test".to_string()));
    }

    #[test]
    fn test_process_info_serde() {
        let p = ProcessInfo::new(42, "app").with_path("/bin/app");
        let json = serde_json::to_value(&p).unwrap();
        assert_eq!(json["pid"], 42);
        assert_eq!(json["name"], "app");
        assert_eq!(json["path"], "/bin/app");
        // icon should be skipped (None)
        assert!(json.get("icon").is_none());

        let deserialized: ProcessInfo = serde_json::from_value(json).unwrap();
        assert_eq!(deserialized.pid, 42);
        assert_eq!(deserialized.name, "app");
    }

    // --- ApplicationInfo ---

    #[test]
    fn test_application_info_new() {
        let app = ApplicationInfo::new("com.example.app", "My App");
        assert_eq!(app.identifier, "com.example.app");
        assert_eq!(app.name, "My App");
        assert!(app.pid.is_none());
    }

    #[test]
    fn test_application_info_with_pid() {
        let app = ApplicationInfo::new("com.test", "Test").with_pid(9999);
        assert_eq!(app.pid, Some(9999));
    }

    #[test]
    fn test_application_info_serde() {
        let app = ApplicationInfo::new("com.app", "App").with_pid(123);
        let json = serde_json::to_value(&app).unwrap();
        assert_eq!(json["identifier"], "com.app");
        assert_eq!(json["pid"], 123);
    }

    // --- AttachTarget ---

    #[test]
    fn test_attach_target_display_pid() {
        let t = AttachTarget::Pid(1234);
        assert_eq!(format!("{}", t), "pid:1234");
    }

    #[test]
    fn test_attach_target_display_name() {
        let t = AttachTarget::Name("Safari".into());
        assert_eq!(format!("{}", t), "name:Safari");
    }

    #[test]
    fn test_attach_target_display_identifier() {
        let t = AttachTarget::Identifier("com.apple.Safari".into());
        assert_eq!(format!("{}", t), "identifier:com.apple.Safari");
    }

    #[test]
    fn test_attach_target_serde() {
        let t = AttachTarget::Pid(42);
        let json = serde_json::to_string(&t).unwrap();
        let deserialized: AttachTarget = serde_json::from_str(&json).unwrap();
        match deserialized {
            AttachTarget::Pid(pid) => assert_eq!(pid, 42),
            _ => panic!("Expected Pid variant"),
        }
    }

    // --- SpawnOptions ---

    #[test]
    fn test_spawn_options_default() {
        let opts = SpawnOptions::default();
        assert!(opts.argv.is_empty());
        assert!(opts.envp.is_empty());
        assert!(opts.cwd.is_none());
        match opts.stdio {
            StdioMode::Inherit => {}
            _ => panic!("Expected Inherit"),
        }
    }

    // --- FridaDeviceType ---

    #[test]
    fn test_frida_device_type_display() {
        assert_eq!(format!("{}", FridaDeviceType::Local), "local");
        assert_eq!(format!("{}", FridaDeviceType::Remote), "remote");
        assert_eq!(format!("{}", FridaDeviceType::Usb), "usb");
    }

    #[test]
    fn test_frida_device_type_eq() {
        assert_eq!(FridaDeviceType::Local, FridaDeviceType::Local);
        assert_ne!(FridaDeviceType::Local, FridaDeviceType::Remote);
    }

    #[test]
    fn test_frida_device_type_serde() {
        let json = serde_json::to_string(&FridaDeviceType::Usb).unwrap();
        assert_eq!(json, "\"usb\"");
        let deserialized: FridaDeviceType = serde_json::from_str("\"remote\"").unwrap();
        assert_eq!(deserialized, FridaDeviceType::Remote);
    }

    // --- DeviceInfo ---

    #[test]
    fn test_device_info_new() {
        let d = DeviceInfo::new("dev1", "My Device", FridaDeviceType::Local);
        assert_eq!(d.id, "dev1");
        assert_eq!(d.name, "My Device");
        assert_eq!(d.device_type, FridaDeviceType::Local);
    }

    #[test]
    fn test_device_info_serde() {
        let d = DeviceInfo::new("usb-1", "iPhone", FridaDeviceType::Usb);
        let json = serde_json::to_value(&d).unwrap();
        assert_eq!(json["id"], "usb-1");
        assert_eq!(json["name"], "iPhone");
        assert_eq!(json["device_type"], "usb");

        let deserialized: DeviceInfo = serde_json::from_value(json).unwrap();
        assert_eq!(deserialized.device_type, FridaDeviceType::Usb);
    }
}
