pub mod error;
pub mod process;
pub mod session;

#[cfg(feature = "mock")]
pub mod mock;

#[cfg(feature = "real")]
pub mod manager;

pub use error::FridaError;
pub use process::ProcessInfo;
pub use session::FridaSession;

#[cfg(feature = "mock")]
pub use mock::FridaManager;

#[cfg(feature = "real")]
pub use manager::FridaManager;
