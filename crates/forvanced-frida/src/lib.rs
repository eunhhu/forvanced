pub mod error;
pub mod process;
pub mod session;

// Mock and real implementations are mutually exclusive
// If both are enabled, prefer real (allows: --features real with default mock)
#[cfg(all(feature = "mock", not(feature = "real")))]
pub mod mock;

#[cfg(feature = "real")]
pub mod manager;

pub use error::FridaError;
pub use process::{ApplicationInfo, AttachTarget, DeviceInfo, FridaDeviceType, ProcessInfo, SpawnOptions};
pub use session::{FridaSession, MessageCallback, RpcResult, ScriptHandle, ScriptMessage, SessionState};

#[cfg(all(feature = "mock", not(feature = "real")))]
pub use mock::FridaManager;

#[cfg(feature = "real")]
pub use manager::FridaManager;
