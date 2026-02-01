//! Runtime value types for script execution

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;

/// Runtime value that can be passed between nodes
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Value {
    /// Null/undefined value
    Null,
    /// Boolean value
    Boolean(bool),
    /// Integer value (i64 for maximum range)
    Integer(i64),
    /// Floating point value
    Float(f64),
    /// String value
    String(String),
    /// Pointer/address value (stored as hex string for JSON compatibility)
    Pointer(u64),
    /// Array of values
    Array(Vec<Value>),
    /// Object/map of values
    Object(HashMap<String, Value>),
}

impl Value {
    /// Create a null value
    pub fn null() -> Self {
        Value::Null
    }

    /// Create a pointer from a hex string (e.g., "0x12345678")
    pub fn from_hex(s: &str) -> Option<Self> {
        let s = s.trim_start_matches("0x").trim_start_matches("0X");
        u64::from_str_radix(s, 16).ok().map(Value::Pointer)
    }

    /// Check if value is null
    pub fn is_null(&self) -> bool {
        matches!(self, Value::Null)
    }

    /// Check if value is truthy (for boolean contexts)
    pub fn is_truthy(&self) -> bool {
        match self {
            Value::Null => false,
            Value::Boolean(b) => *b,
            Value::Integer(i) => *i != 0,
            Value::Float(f) => *f != 0.0 && !f.is_nan(),
            Value::String(s) => !s.is_empty(),
            Value::Pointer(p) => *p != 0,
            Value::Array(arr) => !arr.is_empty(),
            Value::Object(obj) => !obj.is_empty(),
        }
    }

    /// Get type name for error messages
    pub fn type_name(&self) -> &'static str {
        match self {
            Value::Null => "null",
            Value::Boolean(_) => "boolean",
            Value::Integer(_) => "integer",
            Value::Float(_) => "float",
            Value::String(_) => "string",
            Value::Pointer(_) => "pointer",
            Value::Array(_) => "array",
            Value::Object(_) => "object",
        }
    }

    /// Try to convert to boolean
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Boolean(b) => Some(*b),
            Value::Integer(i) => Some(*i != 0),
            _ => None,
        }
    }

    /// Try to convert to i64
    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Value::Integer(i) => Some(*i),
            Value::Float(f) => Some(*f as i64),
            Value::Pointer(p) => Some(*p as i64),
            Value::Boolean(b) => Some(if *b { 1 } else { 0 }),
            Value::String(s) => s.parse().ok(),
            _ => None,
        }
    }

    /// Try to convert to f64
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Float(f) => Some(*f),
            Value::Integer(i) => Some(*i as f64),
            Value::String(s) => s.parse().ok(),
            _ => None,
        }
    }

    /// Try to convert to u64 (for pointers)
    pub fn as_u64(&self) -> Option<u64> {
        match self {
            Value::Pointer(p) => Some(*p),
            Value::Integer(i) => Some(*i as u64),
            Value::Float(f) => Some(*f as u64),
            Value::String(s) => {
                // Try hex format first
                if let Some(hex) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
                    u64::from_str_radix(hex, 16).ok()
                } else {
                    s.parse().ok()
                }
            }
            _ => None,
        }
    }

    /// Try to get as string
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::String(s) => Some(s),
            _ => None,
        }
    }

    /// Convert to string representation
    pub fn to_string_value(&self) -> String {
        self.to_string_with_depth(0, 3)
    }

    /// Convert to string representation with depth limit for nested structures
    fn to_string_with_depth(&self, current_depth: usize, max_depth: usize) -> String {
        match self {
            Value::Null => "null".to_string(),
            Value::Boolean(b) => b.to_string(),
            Value::Integer(i) => i.to_string(),
            Value::Float(f) => f.to_string(),
            Value::String(s) => s.clone(),
            Value::Pointer(p) => format!("0x{:x}", p),
            Value::Array(arr) => {
                if current_depth >= max_depth {
                    format!("[Array({})]", arr.len())
                } else if arr.is_empty() {
                    "[]".to_string()
                } else if arr.len() <= 5 {
                    let items: Vec<String> = arr
                        .iter()
                        .map(|v| v.to_string_with_depth(current_depth + 1, max_depth))
                        .collect();
                    format!("[{}]", items.join(", "))
                } else {
                    let items: Vec<String> = arr
                        .iter()
                        .take(3)
                        .map(|v| v.to_string_with_depth(current_depth + 1, max_depth))
                        .collect();
                    format!("[{}, ... ({} more)]", items.join(", "), arr.len() - 3)
                }
            }
            Value::Object(obj) => {
                if current_depth >= max_depth {
                    format!("{{Object({})}}", obj.len())
                } else if obj.is_empty() {
                    "{}".to_string()
                } else {
                    let mut pairs: Vec<String> = obj
                        .iter()
                        .take(5)
                        .map(|(k, v)| {
                            format!(
                                "{}: {}",
                                k,
                                v.to_string_with_depth(current_depth + 1, max_depth)
                            )
                        })
                        .collect();
                    if obj.len() > 5 {
                        pairs.push(format!("... ({} more)", obj.len() - 5));
                    }
                    format!("{{{}}}", pairs.join(", "))
                }
            }
        }
    }

    /// Try to get as array
    pub fn as_array(&self) -> Option<&Vec<Value>> {
        match self {
            Value::Array(arr) => Some(arr),
            _ => None,
        }
    }

    /// Try to get as mutable array
    pub fn as_array_mut(&mut self) -> Option<&mut Vec<Value>> {
        match self {
            Value::Array(arr) => Some(arr),
            _ => None,
        }
    }

    /// Try to get as object
    pub fn as_object(&self) -> Option<&HashMap<String, Value>> {
        match self {
            Value::Object(obj) => Some(obj),
            _ => None,
        }
    }

    /// Try to get as mutable object
    pub fn as_object_mut(&mut self) -> Option<&mut HashMap<String, Value>> {
        match self {
            Value::Object(obj) => Some(obj),
            _ => None,
        }
    }

    /// Get property from object or array
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Object(obj) => obj.get(key),
            Value::Array(arr) => {
                let idx: usize = key.parse().ok()?;
                arr.get(idx)
            }
            _ => None,
        }
    }

    /// Set property on object
    pub fn set(&mut self, key: String, value: Value) -> bool {
        match self {
            Value::Object(obj) => {
                obj.insert(key, value);
                true
            }
            Value::Array(arr) => {
                if let Ok(idx) = key.parse::<usize>() {
                    if idx < arr.len() {
                        arr[idx] = value;
                        return true;
                    }
                }
                false
            }
            _ => false,
        }
    }
}

impl Default for Value {
    fn default() -> Self {
        Value::Null
    }
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_string_value())
    }
}

// Convenient From implementations
impl From<bool> for Value {
    fn from(b: bool) -> Self {
        Value::Boolean(b)
    }
}

impl From<i32> for Value {
    fn from(i: i32) -> Self {
        Value::Integer(i as i64)
    }
}

impl From<i64> for Value {
    fn from(i: i64) -> Self {
        Value::Integer(i)
    }
}

impl From<u32> for Value {
    fn from(u: u32) -> Self {
        Value::Integer(u as i64)
    }
}

impl From<u64> for Value {
    fn from(u: u64) -> Self {
        // For u64 > i64::MAX, use Pointer type
        if u > i64::MAX as u64 {
            Value::Pointer(u)
        } else {
            Value::Integer(u as i64)
        }
    }
}

impl From<f32> for Value {
    fn from(f: f32) -> Self {
        Value::Float(f as f64)
    }
}

impl From<f64> for Value {
    fn from(f: f64) -> Self {
        Value::Float(f)
    }
}

impl From<String> for Value {
    fn from(s: String) -> Self {
        Value::String(s)
    }
}

impl From<&str> for Value {
    fn from(s: &str) -> Self {
        Value::String(s.to_string())
    }
}

impl<T: Into<Value>> From<Vec<T>> for Value {
    fn from(v: Vec<T>) -> Self {
        Value::Array(v.into_iter().map(Into::into).collect())
    }
}

impl From<HashMap<String, Value>> for Value {
    fn from(m: HashMap<String, Value>) -> Self {
        Value::Object(m)
    }
}

impl From<serde_json::Value> for Value {
    fn from(json: serde_json::Value) -> Self {
        match json {
            serde_json::Value::Null => Value::Null,
            serde_json::Value::Bool(b) => Value::Boolean(b),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Value::Integer(i)
                } else if let Some(f) = n.as_f64() {
                    Value::Float(f)
                } else {
                    Value::Null
                }
            }
            serde_json::Value::String(s) => Value::String(s),
            serde_json::Value::Array(arr) => {
                Value::Array(arr.into_iter().map(Value::from).collect())
            }
            serde_json::Value::Object(obj) => {
                Value::Object(obj.into_iter().map(|(k, v)| (k, Value::from(v))).collect())
            }
        }
    }
}

impl From<Value> for serde_json::Value {
    fn from(val: Value) -> Self {
        match val {
            Value::Null => serde_json::Value::Null,
            Value::Boolean(b) => serde_json::Value::Bool(b),
            Value::Integer(i) => serde_json::Value::Number(i.into()),
            Value::Float(f) => serde_json::Number::from_f64(f)
                .map(serde_json::Value::Number)
                .unwrap_or(serde_json::Value::Null),
            Value::String(s) => serde_json::Value::String(s),
            Value::Pointer(p) => serde_json::Value::String(format!("0x{:x}", p)),
            Value::Array(arr) => {
                serde_json::Value::Array(arr.into_iter().map(serde_json::Value::from).collect())
            }
            Value::Object(obj) => serde_json::Value::Object(
                obj.into_iter()
                    .map(|(k, v)| (k, serde_json::Value::from(v)))
                    .collect(),
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truthiness() {
        assert!(!Value::Null.is_truthy());
        assert!(!Value::Boolean(false).is_truthy());
        assert!(Value::Boolean(true).is_truthy());
        assert!(!Value::Integer(0).is_truthy());
        assert!(Value::Integer(1).is_truthy());
        assert!(!Value::String("".to_string()).is_truthy());
        assert!(Value::String("hello".to_string()).is_truthy());
    }

    #[test]
    fn test_conversions() {
        assert_eq!(Value::Integer(42).as_i64(), Some(42));
        assert_eq!(Value::Float(3.14).as_f64(), Some(3.14));
        assert_eq!(Value::Pointer(0x1234).as_u64(), Some(0x1234));
        assert_eq!(
            Value::String("0x1234".to_string()).as_u64(),
            Some(0x1234)
        );
    }

    #[test]
    fn test_from_hex() {
        assert_eq!(Value::from_hex("0x1234"), Some(Value::Pointer(0x1234)));
        assert_eq!(Value::from_hex("0X1234"), Some(Value::Pointer(0x1234)));
        assert_eq!(Value::from_hex("1234"), Some(Value::Pointer(0x1234)));
    }
}
