// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Fix for Linux Wayland WebKit rendering issues
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        // Force X11 backend to avoid Wayland rendering issues (grey screen)
        std::env::set_var("GDK_BACKEND", "x11");
    }

    telegram_cloud_lib::run()
}
