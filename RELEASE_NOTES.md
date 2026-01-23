# Paperfold v0.1.6 Release Notes

We are excited to announce version 0.1.6 of Paperfold, focused on stability, cleanup, and compatibility.

## 🚀 Key Changes

### Framework Upgrade
- **Tauri 2.9.5**: Upgraded the underlying framework to Tauri v2.9.5 for improved performance, security patches, and better system integration.

### Linux Compatibility
- **Wayland Support**: Confirmed and finalized the fix for Linux Wayland users. The application now correctly bypasses potential "grey screen" issues caused by hardware acceleration bug in WebKitGTK on certain drivers (notably NVIDIA), ensuring a smooth experience across all Linux desktop environments.

### Feature Refinement
- **Vault Feature Removed**: To streamline the user experience, the experimental "Encrypted Vault" feature has been removed. All associated UI elements, logic, and types have been cleaned up to reduce codebase complexity and eliminate potential error sources.

## 🛠️ Internal Improvements
- **Codebase Cleanup**: Removed obsoleted type definitions and unused state variables related to legacy features.
- **Dependency Updates**: All core dependencies, including Rust crates and NPM packages, have been updated to their latest compatible versions.

---

**Full Changelog**: https://github.com/damndeepeshdev/Paperfold/compare/v0.1.5...v0.1.6
