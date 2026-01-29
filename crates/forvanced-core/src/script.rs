use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Script {
    pub id: String,
    pub name: String,
    pub content: String,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hotkey: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<ScriptConfig>,
}

impl Script {
    pub fn new(name: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            content: content.into(),
            enabled: true,
            hotkey: None,
            config: None,
        }
    }

    pub fn with_hotkey(mut self, hotkey: impl Into<String>) -> Self {
        self.hotkey = Some(hotkey.into());
        self
    }

    pub fn with_config(mut self, config: ScriptConfig) -> Self {
        self.config = Some(config);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptConfig {
    #[serde(default)]
    pub parameters: Vec<ScriptParameter>,
}

impl Default for ScriptConfig {
    fn default() -> Self {
        Self {
            parameters: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptParameter {
    pub name: String,
    pub label: String,
    #[serde(rename = "type")]
    pub param_type: ParameterType,
    pub default_value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParameterType {
    Boolean,
    Number { min: Option<f64>, max: Option<f64> },
    String,
    Select { options: Vec<String> },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_script() {
        let script = Script::new("Test", "console.log('test');");
        assert_eq!(script.name, "Test");
        assert!(script.enabled);
    }

    #[test]
    fn test_script_with_hotkey() {
        let script = Script::new("Test", "// code").with_hotkey("F1");
        assert_eq!(script.hotkey, Some("F1".to_string()));
    }
}
