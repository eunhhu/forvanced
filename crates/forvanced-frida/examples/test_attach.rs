//! Direct test for Frida attach functionality
//! Run with: cargo run --example test_attach --features real

use frida::{DeviceManager, DeviceType, Frida};
use std::env;
use std::mem::ManuallyDrop;

fn main() {
    let args: Vec<String> = env::args().collect();
    let use_usb = args.iter().any(|a| a == "--usb");
    
    println!("=== Frida Attach Test ===");
    println!("    Use --usb flag to test USB device\n");

    // Initialize Frida - use Box::leak to prevent drop crash
    println!("[1] Initializing Frida...");
    let frida: &'static Frida = Box::leak(Box::new(unsafe { Frida::obtain() }));
    println!("    Frida initialized successfully (leaked to prevent drop crash)\n");

    // Create device manager - wrap in ManuallyDrop to prevent drop crash
    println!("[2] Creating DeviceManager...");
    let device_manager = ManuallyDrop::new(DeviceManager::obtain(frida));
    println!("    DeviceManager created successfully (ManuallyDrop)\n");

    // Enumerate devices
    println!("[3] Enumerating devices...");
    let devices = device_manager.enumerate_all_devices();
    println!("    Found {} devices:", devices.len());
    
    let mut usb_idx: Option<usize> = None;
    let mut local_idx: Option<usize> = None;
    
    for i in 0..devices.len() {
        let device = &devices[i];
        let dtype = device.get_type();
        let type_str = match dtype {
            DeviceType::Local => { local_idx = Some(i); "local" },
            DeviceType::Remote => "remote",
            DeviceType::USB => { usb_idx = Some(i); "usb" },
            _ => "unknown",
        };
        println!("    - {} ({}) [{}]", device.get_name(), device.get_id(), type_str);
    }
    println!();

    // Select device
    println!("[4] Selecting device...");
    let device_idx = if use_usb {
        match usb_idx {
            Some(idx) => {
                println!("    Using USB device: {} ({})", devices[idx].get_name(), devices[idx].get_id());
                idx
            }
            None => {
                println!("    No USB device found!");
                return;
            }
        }
    } else {
        let idx = local_idx.expect("No local device");
        println!("    Using local device: {} ({})", devices[idx].get_name(), devices[idx].get_id());
        idx
    };
    println!();

    // Enumerate processes
    println!("[5] Enumerating processes on device...");
    let processes = devices[device_idx].enumerate_processes();
    println!("    Found {} processes", processes.len());
    
    if processes.is_empty() {
        println!("    ERROR: No processes found! This might be a Frida issue.");
        println!("    Try running 'frida-ps -U' to verify USB device works.\n");
        
        println!("[6] Wrapping objects in ManuallyDrop...");
        let _ = ManuallyDrop::new(processes);
        let _ = ManuallyDrop::new(devices);
        println!("    Done\n");
        
        println!("=== Test Complete (no attach test) ===");
        return;
    }
    
    // Find Discord or bun process
    let mut target_idx: Option<usize> = None;
    for i in 0..processes.len() {
        let name_lower = processes[i].get_name().to_lowercase();
        if name_lower.contains("discord") || name_lower.contains("bun") {
            target_idx = Some(i);
            break;
        }
    }
    
    let (pid, name) = match target_idx {
        Some(idx) => {
            let p = &processes[idx];
            println!("    Found target process: {} (PID: {})", p.get_name(), p.get_pid());
            (p.get_pid(), p.get_name().to_string())
        }
        None => {
            println!("    Discord/bun not found. Available processes:");
            for i in 0..std::cmp::min(10, processes.len()) {
                let p = &processes[i];
                println!("      - {} (PID: {})", p.get_name(), p.get_pid());
            }
            if processes.len() > 10 {
                println!("    ... and {} more", processes.len() - 10);
            }
            
            // Use first process for testing
            let p = &processes[0];
            println!("\n    Using first process: {} (PID: {})", p.get_name(), p.get_pid());
            (p.get_pid(), p.get_name().to_string())
        }
    };
    println!();

    // Attach to process
    println!("[6] Attaching to {} (PID: {})...", name, pid);
    match devices[device_idx].attach(pid) {
        Ok(session) => {
            println!("    Attach successful!");
            println!("    Session created\n");
            
            println!("[7] Now testing what happens when session drops...");
            println!("    (If the program crashes here, drop is the problem)\n");
            
            // Let session drop naturally
            drop(session);
            
            println!("[8] Session dropped successfully!\n");
        }
        Err(e) => {
            println!("    Attach failed: {}", e);
        }
    }

    // Wrap in ManuallyDrop to prevent crash
    println!("[9] Wrapping objects in ManuallyDrop to prevent drop crash...");
    let _ = ManuallyDrop::new(processes);
    let _ = ManuallyDrop::new(devices);
    println!("    Done\n");

    println!("=== Test Complete ===");
    println!("If you see this message, no crash occurred!");
}
