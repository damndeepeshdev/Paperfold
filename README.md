# Cloudra ☁️

**Unlimited Cloud Storage, Powered by Telegram.**

Cloudra is a modern, privacy-focused desktop cloud storage client that leverages Telegram's unlimited file storage API. Built with **Tauri (Rust)** and **React**, it offers a premium, high-performance experience with a stunning "Technical Galaxy" aesthetic.

## 🌟 Features

### 🚀 Unlimited Cloud Storage
- **Zero Types Limits**: Upload files of any type (Documents, Photos, Videos, etc.).
- **2GB Single File Limit**: Upload individual files up to 2GB (4GB for Premium users).
- **Unlimited Total Space**: No cap on the total amount of data you can store.

### 🎨 "Technical Galaxy" Design
- **Premium Dark Aesthetic**: A deeply immersive dark theme with cyan accents, glassmorphism, and subtle glow effects.
- **Glassmorphic Interface**: Panels and sidebars feature blurred backdrops for a modern, depth-rich feel.
- **Micro-Interactions**: Fluid animations powered by `framer-motion` for every interaction.
- **View Options**: Toggle between **Grid** and **List** views with sortable columns.

### 🔍 Powerful Search & Organization
- **Real-Time Search**: Instantly find files and folders with a type-ahead dropdown search.
- **Smart Folder System**: Create nested folders to organize your content (metadata stored locally).
- **Starred Items**: Mark important files or folders with a star for quick access.
- **Recent Files**: Quickly access your most recently uploaded or modified files.

### ⚡ Advanced File Management
- **Drag & Drop Uploads**: Seamlessly upload files by dragging them into the app.
- **Multi-File Queue**: specific visual design for upload progress with "Command Terminal" aesthetics.
- **Custom Interaction Modals**: Replaced native system prompts with beautiful, theme-consistent modals for Renaming, Deleting, and Creating Folders.
- **File Previews**: Click to preview supported files directly within the app.

### 🗑️ Trash & Recovery
- **Soft Delete**: Deleted items move to a Trash bin first.
- **Instant Restore**: Restore files or folders to their original location with one click.
- **Empty Trash**: Permanently clear space when you're sure.

### 🔒 Privacy & Security
- **Direct MTProto Connection**: Connects directly to Telegram servers from your local machine. **No middleman servers.**
- **Local Metadata**: Folder structures and file names are stored in a local encrypted database (`metadata.json`).
- **Encrypted Session**: Your Telegram session is stored securely locally.

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, TailwindCSS, Framer Motion, Lucide Icons.
- **Backend (Core)**: Rust, Tauri v2.
- **Telegram Client**: `grammers` (Rust MTProto implementation).
- **State Management**: React Hooks & Local State.
- **Build Tool**: Vite.

## 📦 Installation & Setup

### Prerequisites
- **Rust**: Ensure you have the latest stable Rust installed (`rustup`).
- **Node.js**: LTS version recommended.
- **Telegram API Credentials**: You need your own `App api_id` and `App api_hash`. Get them from [my.telegram.org](https://my.telegram.org).

### Steps

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/damndeepeshdev/Cloudra.git
    cd Cloudra
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment**
    Create a `.env` file in the `src-tauri` directory with your Telegram credentials:
    ```env
    TELEGRAM_API_ID=your_api_id
    TELEGRAM_API_HASH=your_api_hash
    ```
    *Note: Never commit your `.env` file!*

4.  **Run Development Mode**
    ```bash
    npm run tauri dev
    ```

5.  **Build for Production**
    ```bash
    npm run tauri build
    ```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue.

## 📄 License

This project is licensed under the MIT License.

---
*Disclaimer: Cloudra is a third-party client and is not affiliated with Telegram.*
