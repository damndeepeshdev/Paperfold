// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Fix for Linux Wayland WebKit rendering issues
    #[cfg(target_os = "linux")]
    {
        // optimizing for Wayland while fixing the grey screen issue
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    telegram_cloud_lib::run()
}
