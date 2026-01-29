use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub version: String,
    pub author: Option<String>,
    pub config: ProjectConfig,
    pub ui: UILayout,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

impl Project {
    pub fn new(name: impl Into<String>) -> Self {
        let now = chrono::Utc::now().timestamp_millis();
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            description: None,
            version: "0.1.0".to_string(),
            author: None,
            config: ProjectConfig::default(),
            ui: UILayout::default(),
            created_at: now,
            updated_at: now,
        }
    }

    pub fn touch(&mut self) {
        self.updated_at = chrono::Utc::now().timestamp_millis();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub target: TargetConfig,
    pub build: BuildConfig,
    pub hotkeys: HotkeyConfig,
}

impl Default for ProjectConfig {
    fn default() -> Self {
        Self {
            target: TargetConfig::default(),
            build: BuildConfig::default(),
            hotkeys: HotkeyConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetConfig {
    pub process_name: Option<String>,
    pub process_patterns: Vec<String>,
    pub adapter_type: String,
    #[serde(default)]
    pub adapter_config: serde_json::Value,
    pub auto_attach: bool,
}

impl Default for TargetConfig {
    fn default() -> Self {
        Self {
            process_name: None,
            process_patterns: Vec::new(),
            adapter_type: "local_pc".to_string(),
            adapter_config: serde_json::Value::Null,
            auto_attach: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildConfig {
    pub output_name: Option<String>,
    pub targets: Vec<String>,
    pub icon: Option<String>,
    pub bundle_frida: bool,
}

impl Default for BuildConfig {
    fn default() -> Self {
        Self {
            output_name: None,
            targets: vec!["current".to_string()],
            icon: None,
            bundle_frida: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HotkeyConfig {
    pub enabled: bool,
    pub bindings: Vec<HotkeyBinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyBinding {
    pub key: String,
    pub modifiers: Vec<String>,
    pub action_id: String,
}

// UI Layout
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UILayout {
    pub components: Vec<UIComponent>,
    pub width: u32,
    pub height: u32,
    pub theme: String,
}

impl UILayout {
    pub fn new() -> Self {
        Self {
            components: Vec::new(),
            width: 400,
            height: 600,
            theme: "dark".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIComponent {
    pub id: String,
    #[serde(rename = "type")]
    pub component_type: ComponentType,
    pub label: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub props: serde_json::Value,
    pub bindings: Vec<ActionBinding>,
}

impl UIComponent {
    pub fn new(component_type: ComponentType, label: impl Into<String>, x: f64, y: f64) -> Self {
        let (width, height) = component_type.default_size();
        Self {
            id: Uuid::new_v4().to_string(),
            component_type,
            label: label.into(),
            x,
            y,
            width,
            height,
            props: serde_json::json!({}),
            bindings: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ComponentType {
    Button,
    Toggle,
    Slider,
    Label,
    Input,
    Dropdown,
    Group,
    Spacer,
}

impl ComponentType {
    pub fn default_size(&self) -> (f64, f64) {
        match self {
            Self::Button => (120.0, 36.0),
            Self::Toggle => (160.0, 32.0),
            Self::Slider => (200.0, 40.0),
            Self::Label => (100.0, 24.0),
            Self::Input => (180.0, 36.0),
            Self::Dropdown => (160.0, 36.0),
            Self::Group => (300.0, 200.0),
            Self::Spacer => (100.0, 20.0),
        }
    }
}

// Action Binding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionBinding {
    pub id: String,
    pub event: ComponentEvent,
    pub action: FridaAction,
}

impl ActionBinding {
    pub fn new(event: ComponentEvent, action: FridaAction) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            event,
            action,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ComponentEvent {
    OnClick,
    OnToggle,
    OnChange,
    OnSlide,
}

// Frida Actions
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FridaAction {
    // Memory
    MemoryRead {
        address: String,
        value_type: ValueType,
    },
    MemoryWrite {
        address: String,
        value: String,
        value_type: ValueType,
    },
    MemoryFreeze {
        address: String,
        value: String,
        value_type: ValueType,
        interval_ms: u32,
    },
    MemoryUnfreeze {
        address: String,
    },

    // Scanner
    PatternScan {
        pattern: String,
        protection: String,
    },
    ValueScan {
        value: String,
        value_type: ValueType,
    },

    // Hook
    HookFunction {
        address: String,
        log_enter: bool,
        log_leave: bool,
    },
    ReplaceReturn {
        address: String,
        return_value: String,
    },
    NopFunction {
        address: String,
    },

    // Java (Android)
    JavaHookMethod {
        class_name: String,
        method_name: String,
        overload: Option<String>,
    },
    JavaModifyReturn {
        class_name: String,
        method_name: String,
        return_value: String,
    },
    JavaCallMethod {
        class_name: String,
        method_name: String,
        is_static: bool,
    },

    // ObjC (iOS/macOS)
    ObjcHookMethod {
        class_name: String,
        selector: String,
        is_class_method: bool,
    },
    ObjcModifyReturn {
        class_name: String,
        selector: String,
        return_value: String,
    },

    // Swift
    SwiftHookFunction {
        mangled_name: String,
    },

    // Process
    ListModules,
    FindExport {
        module_name: String,
        export_name: String,
    },

    // Custom (for advanced users)
    Custom {
        script: String,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ValueType {
    Int8,
    UInt8,
    Int16,
    UInt16,
    Int32,
    UInt32,
    Int64,
    UInt64,
    Float,
    Double,
    Pointer,
    String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_project() {
        let project = Project::new("Test Project");
        assert_eq!(project.name, "Test Project");
        assert!(!project.id.is_empty());
    }

    #[test]
    fn test_ui_component() {
        let component = UIComponent::new(ComponentType::Button, "Click Me", 10.0, 20.0);
        assert_eq!(component.label, "Click Me");
        assert_eq!(component.component_type, ComponentType::Button);
        assert_eq!(component.width, 120.0);
        assert_eq!(component.height, 36.0);
    }

    #[test]
    fn test_serialize_project() {
        let mut project = Project::new("Test");
        let mut component = UIComponent::new(ComponentType::Button, "Freeze HP", 10.0, 10.0);
        component.bindings.push(ActionBinding::new(
            ComponentEvent::OnClick,
            FridaAction::MemoryFreeze {
                address: "0x12345678".to_string(),
                value: "999".to_string(),
                value_type: ValueType::Int32,
                interval_ms: 100,
            },
        ));
        project.ui.components.push(component);

        let json = serde_json::to_string_pretty(&project).unwrap();
        assert!(json.contains("Freeze HP"));
        assert!(json.contains("memory_freeze"));
    }
}
