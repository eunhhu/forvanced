//! RPC Bridge for Target node execution
//!
//! This module handles communication with Frida scripts running in the target process.
//! Target nodes (memory operations, hooks, native calls) are executed via RPC.

use crate::error::{ExecutorError, ExecutorResult};
use crate::script::ScriptNode;
use crate::value::Value;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Trait for making RPC calls to Frida.
/// This allows the executor to work without direct Frida dependency.
#[async_trait]
pub trait RpcCaller: Send + Sync {
    /// Call an RPC method on the Frida script
    async fn call(
        &self,
        method: &str,
        args: Vec<serde_json::Value>,
    ) -> Result<serde_json::Value, String>;
}

/// A no-op RPC caller that returns errors (for when no Frida is connected)
pub struct NoOpRpcCaller;

#[async_trait]
impl RpcCaller for NoOpRpcCaller {
    async fn call(
        &self,
        method: &str,
        _args: Vec<serde_json::Value>,
    ) -> Result<serde_json::Value, String> {
        Err(format!(
            "RPC call to '{}' failed: No Frida session connected",
            method
        ))
    }
}

/// RPC request sent to the target
#[derive(Debug, Clone, Serialize)]
pub struct RpcRequest {
    pub id: u64,
    pub node_type: String,
    pub config: serde_json::Value,
    pub inputs: HashMap<String, serde_json::Value>,
}

/// RPC response from the target
#[derive(Debug, Clone, Deserialize)]
pub struct RpcResponse {
    pub id: u64,
    pub success: bool,
    pub outputs: Option<HashMap<String, serde_json::Value>>,
    pub error: Option<String>,
}

/// Bridge for RPC communication with Frida target
pub struct RpcBridge {
    /// Current session ID
    session_id: Option<String>,

    /// Current script ID
    script_id: Option<String>,

    /// RPC caller implementation
    rpc_caller: Arc<RwLock<Option<Arc<dyn RpcCaller>>>>,

    /// Request counter for unique IDs
    request_counter: Arc<RwLock<u64>>,

    /// Timeout for RPC calls (milliseconds)
    #[allow(dead_code)]
    timeout_ms: u64,
}

impl RpcBridge {
    /// Create a new RPC bridge
    pub fn new() -> Self {
        Self {
            session_id: None,
            script_id: None,
            rpc_caller: Arc::new(RwLock::new(None)),
            request_counter: Arc::new(RwLock::new(0)),
            timeout_ms: 5000, // 5 second default timeout
        }
    }

    /// Set the session ID
    pub fn set_session(&mut self, session_id: String) {
        self.session_id = Some(session_id);
    }

    /// Set the script ID
    pub fn set_script(&mut self, script_id: String) {
        self.script_id = Some(script_id);
    }

    /// Set the RPC caller
    pub async fn set_rpc_caller(&self, caller: Arc<dyn RpcCaller>) {
        *self.rpc_caller.write().await = Some(caller);
    }

    /// Clear the session
    pub fn clear_session(&mut self) {
        self.session_id = None;
        self.script_id = None;
    }

    /// Clear the RPC caller
    pub async fn clear_rpc_caller(&self) {
        *self.rpc_caller.write().await = None;
    }

    /// Set the timeout for RPC calls
    pub fn set_timeout(&mut self, timeout_ms: u64) {
        self.timeout_ms = timeout_ms;
    }

    /// Check if connected to a session
    pub fn is_connected(&self) -> bool {
        self.session_id.is_some()
    }

    /// Get the next request ID
    async fn next_request_id(&self) -> u64 {
        let mut counter = self.request_counter.write().await;
        *counter += 1;
        *counter
    }

    /// Execute a target node via RPC
    pub async fn execute_target_node(
        &self,
        node: &ScriptNode,
        inputs: &HashMap<String, Value>,
    ) -> ExecutorResult<HashMap<String, Value>> {
        let _session_id = self
            .session_id
            .as_ref()
            .ok_or(ExecutorError::NotAttached)?;

        let request_id = self.next_request_id().await;

        // Convert inputs to JSON
        let json_inputs: HashMap<String, serde_json::Value> = inputs
            .iter()
            .map(|(k, v)| (k.clone(), serde_json::Value::from(v.clone())))
            .collect();

        let request = RpcRequest {
            id: request_id,
            node_type: node.node_type.clone(),
            config: serde_json::Value::Object(
                node.config
                    .iter()
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect(),
            ),
            inputs: json_inputs,
        };

        // Get the RPC caller
        let caller_guard = self.rpc_caller.read().await;
        let caller = caller_guard
            .as_ref()
            .ok_or_else(|| ExecutorError::RpcError("No RPC caller configured".to_string()))?;

        // Call the RPC method
        let request_json = serde_json::to_value(&request)
            .map_err(|e| ExecutorError::RpcError(format!("Failed to serialize request: {}", e)))?;

        let response_json = caller
            .call("executeTargetNode", vec![request_json])
            .await
            .map_err(|e| ExecutorError::RpcError(e))?;

        // Parse the response
        let response: RpcResponse = serde_json::from_value(response_json)
            .map_err(|e| ExecutorError::RpcError(format!("Failed to parse response: {}", e)))?;

        if !response.success {
            return Err(ExecutorError::RpcError(
                response.error.unwrap_or_else(|| "Unknown RPC error".to_string()),
            ));
        }

        // Convert outputs back to Value
        let outputs = response
            .outputs
            .unwrap_or_default()
            .into_iter()
            .map(|(k, v)| (k, Value::from(v)))
            .collect();

        Ok(outputs)
    }

    /// Execute multiple target nodes in a batch (optimization)
    pub async fn execute_batch(
        &self,
        nodes: &[(ScriptNode, HashMap<String, Value>)],
    ) -> ExecutorResult<Vec<HashMap<String, Value>>> {
        let mut results = Vec::with_capacity(nodes.len());

        for (node, inputs) in nodes {
            let result = self.execute_target_node(node, inputs).await?;
            results.push(result);
        }

        Ok(results)
    }
}

impl Default for RpcBridge {
    fn default() -> Self {
        Self::new()
    }
}

/// Generate the JavaScript code for the target-side RPC handler
///
/// This JavaScript code is injected into the target process and handles
/// RPC calls from the host executor.
pub fn generate_target_script() -> String {
    r#"
// Forvanced Target RPC Handler
// This script handles RPC calls from the host executor

'use strict';

// Target node implementations
const targetNodes = {
    // Memory Operations
    memory_read: function(config, inputs) {
        const address = ptr(inputs.address);
        const valueType = config.valueType || 'int32';

        let value;
        switch (valueType) {
            case 'int8': value = address.readS8(); break;
            case 'uint8': value = address.readU8(); break;
            case 'int16': value = address.readS16(); break;
            case 'uint16': value = address.readU16(); break;
            case 'int32': value = address.readS32(); break;
            case 'uint32': value = address.readU32(); break;
            case 'int64': value = address.readS64().toString(); break;
            case 'uint64': value = address.readU64().toString(); break;
            case 'float': value = address.readFloat(); break;
            case 'double': value = address.readDouble(); break;
            case 'pointer': value = address.readPointer().toString(); break;
            case 'string': value = address.readUtf8String(); break;
            default: value = address.readS32();
        }

        return { value: value };
    },

    memory_write: function(config, inputs) {
        const address = ptr(inputs.address);
        const value = inputs.value;
        const valueType = config.valueType || 'int32';

        switch (valueType) {
            case 'int8': address.writeS8(value); break;
            case 'uint8': address.writeU8(value); break;
            case 'int16': address.writeS16(value); break;
            case 'uint16': address.writeU16(value); break;
            case 'int32': address.writeS32(value); break;
            case 'uint32': address.writeU32(value); break;
            case 'int64': address.writeS64(int64(value)); break;
            case 'uint64': address.writeU64(uint64(value)); break;
            case 'float': address.writeFloat(value); break;
            case 'double': address.writeDouble(value); break;
            case 'pointer': address.writePointer(ptr(value)); break;
            case 'string': address.writeUtf8String(value); break;
            default: address.writeS32(value);
        }

        return {};
    },

    memory_scan: function(config, inputs) {
        const pattern = inputs.value.toString();
        const protection = config.protection || 'r--';
        const ranges = Process.enumerateRanges(protection);

        const results = [];
        for (const range of ranges) {
            const matches = Memory.scanSync(range.base, range.size, pattern);
            for (const match of matches) {
                results.push(match.address.toString());
            }
        }

        return { results: results, count: results.length };
    },

    memory_alloc: function(config, inputs) {
        const size = inputs.size || config.size || 256;
        const address = Memory.alloc(size);
        return { address: address.toString() };
    },

    memory_protect: function(config, inputs) {
        const address = ptr(inputs.address);
        const size = inputs.size;
        const protection = config.protection || 'rwx';
        const success = Memory.protect(address, size, protection);
        return { success: success };
    },

    // Pointer Operations
    pointer_add: function(config, inputs) {
        const pointer = ptr(inputs.pointer);
        const offset = parseInt(inputs.offset);
        const result = pointer.add(offset);
        return { result: result.toString() };
    },

    pointer_read: function(config, inputs) {
        const pointer = ptr(inputs.pointer);
        const readType = config.readType || 'uint32';

        let value;
        switch (readType) {
            case 'pointer': value = pointer.readPointer().toString(); break;
            case 'int8': value = pointer.readS8(); break;
            case 'uint8': value = pointer.readU8(); break;
            case 'int16': value = pointer.readS16(); break;
            case 'uint16': value = pointer.readU16(); break;
            case 'int32': value = pointer.readS32(); break;
            case 'uint32': value = pointer.readU32(); break;
            case 'int64': value = pointer.readS64().toString(); break;
            case 'uint64': value = pointer.readU64().toString(); break;
            case 'float': value = pointer.readFloat(); break;
            case 'double': value = pointer.readDouble(); break;
            case 'utf8': value = pointer.readUtf8String(); break;
            case 'utf16': value = pointer.readUtf16String(); break;
            default: value = pointer.readU32();
        }

        return { value: value };
    },

    pointer_write: function(config, inputs) {
        const pointer = ptr(inputs.pointer);
        const value = inputs.value;
        const writeType = config.writeType || 'uint32';

        switch (writeType) {
            case 'pointer': pointer.writePointer(ptr(value)); break;
            case 'int8': pointer.writeS8(value); break;
            case 'uint8': pointer.writeU8(value); break;
            case 'int16': pointer.writeS16(value); break;
            case 'uint16': pointer.writeU16(value); break;
            case 'int32': pointer.writeS32(value); break;
            case 'uint32': pointer.writeU32(value); break;
            case 'int64': pointer.writeS64(int64(value)); break;
            case 'uint64': pointer.writeU64(uint64(value)); break;
            case 'float': pointer.writeFloat(value); break;
            case 'double': pointer.writeDouble(value); break;
            case 'utf8': pointer.writeUtf8String(value); break;
            case 'utf16': pointer.writeUtf16String(value); break;
            default: pointer.writeU32(value);
        }

        return {};
    },

    // Module Operations
    get_module: function(config, inputs) {
        const name = inputs.name;
        const module = Process.findModuleByName(name);
        if (!module) {
            return { module: null, base: '0x0', size: 0 };
        }
        return {
            module: module.name,
            base: module.base.toString(),
            size: module.size
        };
    },

    find_symbol: function(config, inputs) {
        const moduleName = inputs.module;
        const symbolName = inputs.symbol;
        const address = Module.findExportByName(moduleName, symbolName);
        return { address: address ? address.toString() : '0x0' };
    },

    get_base_address: function(config, inputs) {
        const moduleName = inputs.moduleName;
        const module = Process.findModuleByName(moduleName);
        return { address: module ? module.base.toString() : '0x0' };
    },

    enumerate_modules: function(config, inputs) {
        const modules = Process.enumerateModules();
        return {
            modules: modules.map(m => ({
                name: m.name,
                base: m.base.toString(),
                size: m.size,
                path: m.path
            })),
            count: modules.length
        };
    },

    enumerate_exports: function(config, inputs) {
        const moduleName = inputs.moduleName;
        const module = Process.findModuleByName(moduleName);
        if (!module) {
            return { exports: [], count: 0 };
        }
        const exports = module.enumerateExports();
        return {
            exports: exports.map(e => ({
                name: e.name,
                address: e.address.toString(),
                type: e.type
            })),
            count: exports.length
        };
    },

    // Native Call
    call_native: function(config, inputs) {
        const address = ptr(inputs.address);
        const returnType = config.returnType || 'void';
        const argTypes = config.argTypes || [];
        const abi = config.abi || 'default';

        const args = [];
        for (let i = 0; i < (config.argCount || 0); i++) {
            args.push(inputs['arg' + i]);
        }

        const func = new NativeFunction(address, returnType, argTypes, { abi: abi });
        const result = func(...args);

        return { return: result };
    }
};

// Interceptor state (for attached hooks)
const activeInterceptors = new Map();

// RPC exports for host communication
rpc.exports = {
    // Execute a single target node
    executeTargetNode: function(request) {
        try {
            const handler = targetNodes[request.node_type];
            if (!handler) {
                return {
                    id: request.id,
                    success: false,
                    error: 'Unknown node type: ' + request.node_type
                };
            }

            const outputs = handler(request.config, request.inputs);
            return {
                id: request.id,
                success: true,
                outputs: outputs
            };
        } catch (e) {
            return {
                id: request.id,
                success: false,
                error: e.toString()
            };
        }
    },

    // Attach interceptor
    attachInterceptor: function(id, address, options) {
        const addr = ptr(address);
        const listener = Interceptor.attach(addr, {
            onEnter: function(args) {
                send({ type: 'interceptor', event: 'enter', id: id, args: args });
            },
            onLeave: function(retval) {
                send({ type: 'interceptor', event: 'leave', id: id, retval: retval });
            }
        });
        activeInterceptors.set(id, listener);
        return { success: true };
    },

    // Detach interceptor
    detachInterceptor: function(id) {
        const listener = activeInterceptors.get(id);
        if (listener) {
            listener.detach();
            activeInterceptors.delete(id);
            return { success: true };
        }
        return { success: false, error: 'Interceptor not found' };
    },

    // Detach all interceptors
    detachAll: function() {
        Interceptor.detachAll();
        activeInterceptors.clear();
        return { success: true };
    },

    // Ping for health check
    ping: function() {
        return { alive: true, timestamp: Date.now() };
    }
};

console.log('[Forvanced] Target RPC handler loaded');
"#.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rpc_bridge_creation() {
        let bridge = RpcBridge::new();
        assert!(!bridge.is_connected());
    }

    #[test]
    fn test_rpc_bridge_session() {
        let mut bridge = RpcBridge::new();
        bridge.set_session("session-123".to_string());
        assert!(bridge.is_connected());
        bridge.clear_session();
        assert!(!bridge.is_connected());
    }

    #[test]
    fn test_generate_target_script() {
        let script = generate_target_script();
        assert!(script.contains("rpc.exports"));
        assert!(script.contains("executeTargetNode"));
        assert!(script.contains("memory_read"));
    }
}
