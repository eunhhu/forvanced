/**
 * Forvanced RPC Bridge Agent
 *
 * This Frida script provides:
 * 1. RPC exports for Rust backend to call (memory ops, module info)
 * 2. Hook registration that sends events back to Rust
 * 3. Memory watch registration
 *
 * Communication flow:
 * - Rust → Frida: rpc.exports.* calls
 * - Frida → Rust: send() messages with event payloads
 */

export const FRIDA_AGENT_SCRIPT = `
'use strict';

// ============================================
// Hook Registry - tracks active hooks
// ============================================
var hookRegistry = {
  interceptors: {},  // hookId -> InvocationListener
  memoryWatches: {}, // watchId -> MemoryAccessMonitor
  javaHooks: {},     // hookId -> hook info
  nextId: 1
};

function generateHookId(prefix) {
  return prefix + '_' + (hookRegistry.nextId++);
}

// ============================================
// Event Sender - sends events to Rust backend
// ============================================
function sendEvent(eventType, data) {
  send({
    type: 'forvanced_event',
    eventType: eventType,
    data: data,
    timestamp: Date.now()
  });
}

// ============================================
// RPC Exports
// ============================================
rpc.exports = {
  // ----------------------------------------
  // Memory Operations
  // ----------------------------------------
  memoryRead: function(address, size, valueType) {
    try {
      var p = ptr(address);
      switch (valueType) {
        case 'int8': return p.readS8();
        case 'uint8': return p.readU8();
        case 'int16': return p.readS16();
        case 'uint16': return p.readU16();
        case 'int32': return p.readS32();
        case 'uint32': return p.readU32();
        case 'int64': return p.readS64().toString();
        case 'uint64': return p.readU64().toString();
        case 'float': return p.readFloat();
        case 'double': return p.readDouble();
        case 'pointer': return p.readPointer().toString();
        case 'string': return p.readCString();
        case 'utf16': return p.readUtf16String();
        default:
          var bytes = p.readByteArray(size);
          return bytes ? Array.from(new Uint8Array(bytes)) : null;
      }
    } catch (e) {
      return { error: e.message };
    }
  },

  memoryWrite: function(address, value, valueType) {
    try {
      var p = ptr(address);
      switch (valueType) {
        case 'int8': p.writeS8(value); break;
        case 'uint8': p.writeU8(value); break;
        case 'int16': p.writeS16(value); break;
        case 'uint16': p.writeU16(value); break;
        case 'int32': p.writeS32(value); break;
        case 'uint32': p.writeU32(value); break;
        case 'int64': p.writeS64(int64(value)); break;
        case 'uint64': p.writeU64(uint64(value)); break;
        case 'float': p.writeFloat(value); break;
        case 'double': p.writeDouble(value); break;
        case 'pointer': p.writePointer(ptr(value)); break;
        default: throw new Error('Unsupported type: ' + valueType);
      }
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  },

  memoryScan: function(pattern, rangeStart, rangeSize) {
    try {
      var matches = [];
      Memory.scan(ptr(rangeStart), rangeSize, pattern, {
        onMatch: function(address, size) {
          matches.push(address.toString());
          return matches.length < 1000 ? 'continue' : 'stop';
        },
        onComplete: function() {}
      });
      return matches;
    } catch (e) {
      return { error: e.message };
    }
  },

  memoryProtect: function(address, size, protection) {
    try {
      Memory.protect(ptr(address), size, protection);
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  },

  memoryAlloc: function(size) {
    try {
      var mem = Memory.alloc(size);
      return mem.toString();
    } catch (e) {
      return { error: e.message };
    }
  },

  // ----------------------------------------
  // Module Operations
  // ----------------------------------------
  getModuleBase: function(moduleName) {
    try {
      var m = Process.getModuleByName(moduleName);
      return m ? m.base.toString() : null;
    } catch (e) {
      return { error: e.message };
    }
  },

  getModuleInfo: function(moduleName) {
    try {
      var m = Process.getModuleByName(moduleName);
      if (!m) return null;
      return {
        name: m.name,
        base: m.base.toString(),
        size: m.size,
        path: m.path
      };
    } catch (e) {
      return { error: e.message };
    }
  },

  enumerateModules: function() {
    try {
      return Process.enumerateModules().map(function(m) {
        return {
          name: m.name,
          base: m.base.toString(),
          size: m.size,
          path: m.path
        };
      });
    } catch (e) {
      return { error: e.message };
    }
  },

  enumerateExports: function(moduleName) {
    try {
      var m = Process.getModuleByName(moduleName);
      if (!m) return { error: 'Module not found' };
      return m.enumerateExports().map(function(exp) {
        return {
          type: exp.type,
          name: exp.name,
          address: exp.address.toString()
        };
      });
    } catch (e) {
      return { error: e.message };
    }
  },

  findExportByName: function(moduleName, exportName) {
    try {
      var addr = Module.findExportByName(moduleName, exportName);
      return addr ? addr.toString() : null;
    } catch (e) {
      return { error: e.message };
    }
  },

  // ----------------------------------------
  // Interceptor (Native Function Hooks)
  // ----------------------------------------
  interceptorAttach: function(address, hookId, options) {
    try {
      var p = ptr(address);
      var hasOnEnter = options && options.onEnter;
      var hasOnLeave = options && options.onLeave;
      var captureArgs = (options && options.captureArgs) || 0;
      var captureRetval = options && options.captureRetval;

      var listener = Interceptor.attach(p, {
        onEnter: hasOnEnter ? function(args) {
          var argValues = [];
          for (var i = 0; i < captureArgs; i++) {
            argValues.push(args[i].toString());
          }
          sendEvent('hook_enter', {
            hookId: hookId,
            address: address,
            args: argValues,
            threadId: this.threadId,
            context: {
              pc: this.context.pc.toString(),
              sp: this.context.sp.toString()
            }
          });
        } : undefined,

        onLeave: hasOnLeave ? function(retval) {
          sendEvent('hook_leave', {
            hookId: hookId,
            address: address,
            retval: captureRetval ? retval.toString() : undefined,
            threadId: this.threadId
          });
        } : undefined
      });

      hookRegistry.interceptors[hookId] = listener;
      return { success: true, hookId: hookId };
    } catch (e) {
      return { error: e.message };
    }
  },

  interceptorDetach: function(hookId) {
    try {
      var listener = hookRegistry.interceptors[hookId];
      if (listener) {
        listener.detach();
        delete hookRegistry.interceptors[hookId];
        return { success: true };
      }
      return { error: 'Hook not found: ' + hookId };
    } catch (e) {
      return { error: e.message };
    }
  },

  interceptorDetachAll: function() {
    try {
      Object.keys(hookRegistry.interceptors).forEach(function(hookId) {
        hookRegistry.interceptors[hookId].detach();
      });
      hookRegistry.interceptors = {};
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  },

  // ----------------------------------------
  // Memory Watch (Access Monitoring)
  // ----------------------------------------
  memoryWatchAdd: function(address, size, watchId, options) {
    try {
      var p = ptr(address);
      var watchRead = options && options.read;
      var watchWrite = options && options.write;
      var watchExecute = options && options.execute;

      MemoryAccessMonitor.enable({
        base: p,
        size: size
      }, {
        onAccess: function(details) {
          if ((watchRead && details.operation === 'read') ||
              (watchWrite && details.operation === 'write') ||
              (watchExecute && details.operation === 'execute')) {
            sendEvent('memory_access', {
              watchId: watchId,
              address: details.address.toString(),
              operation: details.operation,
              from: details.from.toString(),
              threadId: details.threadId
            });
          }
        }
      });

      hookRegistry.memoryWatches[watchId] = { address: address, size: size };
      return { success: true, watchId: watchId };
    } catch (e) {
      return { error: e.message };
    }
  },

  memoryWatchRemove: function(watchId) {
    try {
      var watch = hookRegistry.memoryWatches[watchId];
      if (watch) {
        MemoryAccessMonitor.disable();
        delete hookRegistry.memoryWatches[watchId];
        return { success: true };
      }
      return { error: 'Watch not found: ' + watchId };
    } catch (e) {
      return { error: e.message };
    }
  },

  // ----------------------------------------
  // Java Hooks (Android)
  // ----------------------------------------
  javaAvailable: function() {
    return Java.available;
  },

  javaHookMethod: function(className, methodName, hookId, options) {
    if (!Java.available) {
      return { error: 'Java runtime not available' };
    }

    try {
      Java.perform(function() {
        var clazz = Java.use(className);
        var overloads = clazz[methodName].overloads;

        overloads.forEach(function(method) {
          method.implementation = function() {
            var args = Array.prototype.slice.call(arguments);
            var argStrings = args.map(function(arg) {
              return arg ? arg.toString() : 'null';
            });

            sendEvent('java_hook_enter', {
              hookId: hookId,
              className: className,
              methodName: methodName,
              args: argStrings
            });

            var retval = method.apply(this, args);

            sendEvent('java_hook_leave', {
              hookId: hookId,
              className: className,
              methodName: methodName,
              retval: retval ? retval.toString() : 'null'
            });

            return retval;
          };
        });

        hookRegistry.javaHooks[hookId] = {
          className: className,
          methodName: methodName
        };
      });

      return { success: true, hookId: hookId };
    } catch (e) {
      return { error: e.message };
    }
  },

  // ----------------------------------------
  // Native Function Call
  // ----------------------------------------
  callNative: function(address, returnType, argTypes, args) {
    try {
      var nativeFunc = new NativeFunction(ptr(address), returnType, argTypes);
      var result = nativeFunc.apply(null, args.map(function(arg, i) {
        if (argTypes[i] === 'pointer') return ptr(arg);
        return arg;
      }));
      return result && result.toString ? result.toString() : result;
    } catch (e) {
      return { error: e.message };
    }
  },

  // ----------------------------------------
  // Utility
  // ----------------------------------------
  ping: function() {
    return 'pong';
  },

  getHookInfo: function() {
    return {
      interceptors: Object.keys(hookRegistry.interceptors),
      memoryWatches: Object.keys(hookRegistry.memoryWatches),
      javaHooks: Object.keys(hookRegistry.javaHooks)
    };
  }
};

console.log('[Forvanced] RPC Bridge Agent v2 loaded');
`;
