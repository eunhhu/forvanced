pub mod error;
pub mod local_pc;
pub mod registry;
pub mod remote;
pub mod traits;
pub mod usb;

pub use error::AdapterError;
pub use local_pc::LocalPCAdapter;
pub use registry::AdapterRegistry;
pub use remote::RemoteAdapter;
pub use traits::{AdapterCapabilities, TargetAdapter};
pub use usb::USBAdapter;
