pub mod error;
pub mod local_pc;
pub mod registry;
pub mod traits;

pub use error::AdapterError;
pub use local_pc::LocalPCAdapter;
pub use registry::AdapterRegistry;
pub use traits::{AdapterCapabilities, TargetAdapter};
