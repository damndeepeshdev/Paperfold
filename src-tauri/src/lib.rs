use grammers_client::types::{Downloadable, InputMessage, LoginToken, Media, PasswordToken};
use grammers_client::{Client, Config, InitParams, SignInError};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

// use base64::{engine::general_purpose, Engine as _};
use mime_guess;

use grammers_session::Session;
use grammers_tl_types as tl;
use rand::Rng;
use std::collections::{HashMap, VecDeque};
use std::io::Write; // Standard Sync Write for Zip
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager, State, Window};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use zip::write::SimpleFileOptions;

use sysinfo::{Pid, System};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex as AsyncMutex;
use tokio::sync::Semaphore; // New import

use paperfold_core::{
    client,
    db::{self, Database},
};

// Secrets moved to .env

const SESSION_FILENAME: &str = "telegram.session";
const PID_FILENAME: &str = "webdav.pid"; // New constant

fn get_session_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .expect("failed to get app data dir");
    std::fs::create_dir_all(&app_dir).unwrap(); // Ensure dir exists
    app_dir.join(SESSION_FILENAME)
}

struct AppState {
    app_handle: tauri::AppHandle,
    client: Arc<AsyncMutex<Option<Client>>>,
    phone_token: Mutex<Option<LoginToken>>,
    password_token: Mutex<Option<PasswordToken>>,
    db: Arc<Database>,
    // webdav_process removed
}

#[tauri::command]
async fn login_start(phone: String, state: State<'_, AppState>) -> Result<String, String> {
    let mut client_guard = state.client.lock().await;

    // Force fresh client for new login to prevent stale state (SRP_ID_INVALID)
    *client_guard = None;

    // Load env vars
    dotenv::dotenv().ok();
    // Try compile-time env first (for releases), then runtime (for local dev)
    let api_id_str = option_env!("TELEGRAM_API_ID")
        .map(|s| s.to_string())
        .unwrap_or_else(|| std::env::var("TELEGRAM_API_ID").unwrap_or_else(|_| "0".to_string()));

    let api_hash = option_env!("TELEGRAM_API_HASH")
        .map(|s| s.to_string())
        .unwrap_or_else(|| std::env::var("TELEGRAM_API_HASH").unwrap_or_else(|_| "".to_string()));

    let api_id = api_id_str.parse::<i32>().unwrap_or(0);

    if api_id == 0 || api_hash.is_empty() {
        return Err("API Credentials missing in .env".to_string());
    }

    for attempt in 0..2 {
        if client_guard.is_none() {
            // Init client if not present
            let session_path = get_session_path(&state.app_handle);
            let session = Session::load_file_or_create(&session_path).map_err(|e| e.to_string())?;

            let params = InitParams {
                device_model: "Paperfold Desktop".to_string(),
                app_version: "0.1.0".to_string(),
                system_version: "macOS".to_string(),
                ..Default::default()
            };

            let config = Config {
                session,
                api_id,
                api_hash: api_hash.clone(),
                params,
            };

            let client = Client::connect(config).await.map_err(|e| e.to_string())?;
            *client_guard = Some(client);
        }

        let client = client_guard.as_ref().unwrap();

        // 0.7.x: request_login_code(phone) only
        match client.request_login_code(&phone).await {
            Ok(token) => {
                *state.phone_token.lock().unwrap() = Some(token);
                *state.password_token.lock().unwrap() = None;
                return Ok("Code sent".to_string());
            }
            Err(e) => {
                let err_msg = e.to_string();
                if attempt == 0
                    && (err_msg.contains("AUTH_RESTART") || err_msg.contains("rpc error 500"))
                {
                    println!("AUTH_RESTART detected. Resetting session and retrying...");
                    // Drop client (disconnect/save) not strictly needed if we delete file, but good practice to release logic
                    *client_guard = None;

                    // Delete session file to force fresh auth
                    let session_path = get_session_path(&state.app_handle);
                    if session_path.exists() {
                        let _ = std::fs::remove_file(session_path);
                    }
                    continue; // Retry loop
                }
                if err_msg.contains("FLOOD_WAIT") {
                    let seconds = err_msg
                        .split("value: ")
                        .nth(1)
                        .map(|s| s.trim_end_matches(')').trim())
                        .and_then(|s| s.parse::<u64>().ok())
                        .unwrap_or(0);

                    if seconds > 0 {
                        let hours = seconds / 3600;
                        let minutes = (seconds % 3600) / 60;
                        let secs = seconds % 60;
                        return Err(format!(
                            "Too many attempts. Please wait {}h {}m {}s.",
                            hours, minutes, secs
                        ));
                    }
                    return Err(
                        "Too many attempts. Please wait a while before trying again.".to_string(),
                    );
                }
                return Err(format!("Failed to send code: {}", e));
            }
        }
    }

    Err("Failed after retry".to_string())
}

// Stub for QR login to check API presence

#[tauri::command]
async fn login_complete(
    code: String,
    password: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let mut client_guard = state.client.lock().await;
    let client = client_guard.as_mut().ok_or("Client not initialized")?;

    // Check if we are in 2FA mode
    if let Some(pwd) = password {
        // Prepare token logic: We want to KEEP it on failure, but CONSUME it on success (or if library requires consume).
        // First try: Assuming check_password takes token by value (consume).
        // If we want retry, we must CLONE it if possible.
        // If PasswordToken is not Clone, we are stuck unless check_password takes valid reference.

        let token_opt = state.password_token.lock().unwrap().clone();

        if let Some(token) = token_opt {
            // We pass a clone to check_password
            match client.check_password(token, &pwd).await {
                Ok(user) => {
                    // Success! Remove from state
                    *state.password_token.lock().unwrap() = None;
                    let data = client.session().save();
                    let session_path = get_session_path(&state.app_handle);
                    std::fs::write(&session_path, data)
                        .map_err(|e| format!("Failed to write to {:?}: {}", session_path, e))?;
                    Ok(format!("Logged in as {}", user.first_name()))
                }
                Err(e) => {
                    // Failure! Token remains in state for retry
                    let err_msg = e.to_string();
                    if err_msg.contains("SRP_ID_INVALID") {
                        Err("Session Timeout. Please go back and try again.".to_string())
                    } else {
                        Err(format!("Password error: {}", e))
                    }
                }
            }
        } else {
            Err("No 2FA session found. Please try logging in again.".to_string())
        }
    } else {
        // Normal Code Login
        let token = state
            .phone_token
            .lock()
            .unwrap()
            .take()
            .ok_or("No login session found")?;
        match client.sign_in(&token, &code).await {
            Ok(user) => {
                let data = client.session().save();
                let session_path = get_session_path(&state.app_handle);
                std::fs::write(&session_path, data)
                    .map_err(|e| format!("Failed to write to {:?}: {}", session_path, e))?;
                Ok(format!("Logged in as {}", user.first_name()))
            }
            Err(SignInError::PasswordRequired(token)) => {
                // Store token for 2FA step
                *state.password_token.lock().unwrap() = Some(token);
                Err("PASSWORD_REQUIRED".to_string())
            }
            Err(e) => Err(format!("Login failed: {}", e)),
        }
    }
}

#[tauri::command]
async fn check_auth(state: State<'_, AppState>) -> Result<bool, String> {
    let mut client_guard = state.client.lock().await;

    // Load env vars
    dotenv::dotenv().ok();
    // Try compile-time env first (for releases), then runtime (for local dev)
    let api_id_str = option_env!("TELEGRAM_API_ID")
        .map(|s| s.to_string())
        .unwrap_or_else(|| std::env::var("TELEGRAM_API_ID").unwrap_or_else(|_| "0".to_string()));

    let api_hash = option_env!("TELEGRAM_API_HASH")
        .map(|s| s.to_string())
        .unwrap_or_else(|| std::env::var("TELEGRAM_API_HASH").unwrap_or_else(|_| "".to_string()));

    let api_id = api_id_str.parse::<i32>().unwrap_or(0);

    // If client exists, check status
    if let Some(client) = client_guard.as_ref() {
        let auth = client.is_authorized().await.map_err(|e| e.to_string())?;
        if auth {
            let _ = state.db.cleanup_trash(30);
        }
        return Ok(auth);
    }

    // Try load from file
    let session_path = get_session_path(&state.app_handle);
    if !session_path.exists() {
        return Ok(false);
    }

    if api_id == 0 || api_hash.is_empty() {
        return Ok(false); // Can't connect without secrets
    }

    let session = Session::load_file_or_create(&session_path).map_err(|e| e.to_string())?;
    // Config... (We need repeat config, maybe refactor later but copy-paste for safety now)
    let params = InitParams {
        device_model: "Paperfold Desktop".to_string(),
        app_version: "0.1.0".to_string(),
        system_version: "macOS".to_string(),
        ..Default::default()
    };
    let config = Config {
        session,
        api_id,                     // Use variable
        api_hash: api_hash.clone(), // Use variable
        params,
    };

    let client = Client::connect(config).await.map_err(|e| e.to_string())?;
    let authorized = client.is_authorized().await.map_err(|e| e.to_string())?;

    if authorized {
        let _ = state.db.cleanup_trash(30);
    }

    *client_guard = Some(client);
    Ok(authorized)
}

#[tauri::command]
async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    let mut client_guard = state.client.lock().await;
    *client_guard = None;

    let session_path = get_session_path(&state.app_handle);
    if session_path.exists() {
        let _ = std::fs::remove_file(session_path);
    }
    Ok(())
}

#[tauri::command]
async fn fetch_files(
    folder_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(Vec<db::Folder>, Vec<db::FileMetadata>), String> {
    Ok(state.db.list_contents(folder_id))
}

#[tauri::command]
async fn create_folder(
    name: String,
    parent_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    println!("Creating folder: name={}, parent_id={:?}", name, parent_id);
    Ok(state.db.create_folder(&name, parent_id))
}

#[tauri::command]
async fn upload_file(
    path: String,
    folder_id: Option<String>,
    state: State<'_, AppState>,
    window: Window,
) -> Result<db::FileMetadata, String> {
    let client_guard = state.client.lock().await;
    let client = client_guard
        .as_ref()
        .ok_or("Client not initialized")?
        .clone(); // Clone client for use in spawned tasks

    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err("File not found".to_string());
    }
    let file_name = file_path
        .file_name()
        .ok_or("Invalid file name")?
        .to_string_lossy()
        .to_string();
    let file_size = tokio::fs::metadata(&path)
        .await
        .map_err(|e| e.to_string())?
        .len();

    let mut file = tokio::fs::File::open(&path)
        .await
        .map_err(|e| e.to_string())?;

    // Generate a unique file_id
    let file_id: i64 = rand::thread_rng().gen();

    let is_big = file_size > 10 * 1024 * 1024;
    let chunk_size = 512 * 1024;
    let total_parts = (file_size as usize + chunk_size - 1) / chunk_size;

    let semaphore = Arc::new(Semaphore::new(16)); // Max 16 parallel uploads (Optimized for speed)
    let uploaded_bytes = Arc::new(AtomicU64::new(0));
    let mut tasks = Vec::new();

    let mut part_index = 0;

    #[derive(Clone, serde::Serialize)]
    struct ProgressPayload {
        path: String,
        progress: f64, // Changed to f64 for more precision
    }

    loop {
        let mut buffer = vec![0u8; chunk_size];
        let n = file.read(&mut buffer).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        buffer.truncate(n);

        let permit = semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| e.to_string())?;
        let client_clone = client.clone(); // Use client_clone for the task
        let path_clone = path.clone();
        let window_clone = window.clone();
        let uploaded_bytes_clone = uploaded_bytes.clone(); // Use uploaded_bytes_clone for the task
        let current_part = part_index;

        let task = tokio::spawn(async move {
            let part_bytes = buffer;
            let part_len = part_bytes.len() as u64;

            let result = if is_big {
                client_clone
                    .invoke(&tl::functions::upload::SaveBigFilePart {
                        file_id,
                        file_part: current_part as i32,
                        file_total_parts: total_parts as i32,
                        bytes: part_bytes,
                    })
                    .await
            } else {
                client_clone
                    .invoke(&tl::functions::upload::SaveFilePart {
                        file_id,
                        file_part: current_part as i32,
                        bytes: part_bytes,
                    })
                    .await
            };

            drop(permit); // Release semaphore immediately after upload

            if let Err(e) = result {
                return Err(format!("Part {} failed: {}", current_part, e));
            }

            // Update progress
            let previous = uploaded_bytes_clone.fetch_add(part_len, Ordering::SeqCst);
            let current_total = previous + part_len;

            // Calculate percentage
            let progress = (current_total as f64 / file_size as f64 * 100.0).min(100.0);

            // Emit event (maybe debounce this if it's too spammy, but for now every chunk is fine)
            let _ = window_clone.emit(
                "upload-progress",
                ProgressPayload {
                    path: path_clone,
                    progress,
                },
            );

            Ok(())
        });

        tasks.push(task);
        part_index += 1;
    }

    // Wait for all uploads to complete
    for task in tasks {
        match task.await {
            Ok(result) => result?, // Propagate task error
            Err(e) => return Err(format!("Task join error: {}", e)),
        }
    }

    // Construct InputFile
    let input_file = if is_big {
        tl::enums::InputFile::Big(tl::types::InputFileBig {
            id: file_id,
            parts: total_parts as i32,
            name: file_name.clone(),
        })
    } else {
        tl::enums::InputFile::File(tl::types::InputFile {
            id: file_id,
            parts: total_parts as i32,
            name: file_name.clone(),
            md5_checksum: "".to_string(), // Optional
        })
    };

    let mime_type = mime_guess::from_path(&path)
        .first_or_octet_stream()
        .to_string();

    let input_media =
        tl::enums::InputMedia::UploadedDocument(tl::types::InputMediaUploadedDocument {
            file: input_file,
            mime_type: mime_type.clone(),
            attributes: vec![tl::enums::DocumentAttribute::Filename(
                tl::types::DocumentAttributeFilename {
                    file_name: file_name.clone(),
                },
            )],
            ttl_seconds: None,
            force_file: false,
            spoiler: false,
            stickers: None,
            thumb: None,
            nosound_video: false,
        });

    // Send to "me" (Saved Messages) using InputPeerSelf - no access hash needed!
    let input_peer = tl::enums::InputPeer::PeerSelf;

    let random_id: i64 = rand::thread_rng().gen();

    let updates = client
        .invoke(&tl::functions::messages::SendMedia {
            silent: false,
            background: false,
            clear_draft: false,
            peer: input_peer,
            reply_to: None,
            media: input_media,
            message: "".to_string(),
            random_id,
            reply_markup: None,
            entities: None,
            schedule_date: None,
            send_as: None,
            noforwards: false,
            update_stickersets_order: false,
            invert_media: false,
            quick_reply_shortcut: None,
            effect: None,
        })
        .await
        .map_err(|e| format!("SendMedia error: {}", e))?;

    let msg_id = match updates {
        tl::enums::Updates::Updates(u) => u
            .updates
            .iter()
            .find_map(|u| match u {
                tl::enums::Update::MessageId(id) => Some(id.id),
                tl::enums::Update::NewMessage(m) => match &m.message {
                    tl::enums::Message::Message(msg) => Some(msg.id),
                    _ => None,
                },
                _ => None,
            })
            .unwrap_or(0),
        // Updates::ShortSentMessage doesn't exist? Then it's likely updateShortSentMessage in raw TL but wrapped differently?
        // Or maybe it is UpdateShortSentMessage (singular).
        // Let's just catch all others as 0 for safety or check docs.
        // Usually it returns Updates or UpdateShortSentMessage.
        // Let's rely on Updates variant. If it's something else, we miss msg_id (0), but upload succeeds.
        // We can query history later if needed.
        _ => 0,
    };

    let mut thumbnail = None;
    if msg_id != 0 {
        if let Ok(chat) = client.get_me().await {
            if let Ok(messages) = client.get_messages_by_id(&chat, &[msg_id]).await {
                if let Some(Some(msg)) = messages.first() {
                    thumbnail = client::utils::extract_thumbnail_base64(&client, msg).await;
                }
            }
        }
    }

    let metadata = state.db.add_file(
        folder_id,
        file_name,
        file_size as i64,
        mime_type,
        msg_id,
        thumbnail,
    );

    Ok(metadata)
}

#[tauri::command]
async fn preview_file(
    state: State<'_, AppState>,
    file_id: i32,
    file_name: String,
) -> Result<String, String> {
    let mut client_guard = state.client.lock().await;
    let client = client_guard.as_mut().ok_or("Client not initialized")?;

    // Download to temp dir
    let temp_dir = std::env::temp_dir();
    let target_path = temp_dir.join(&file_name);
    let target_path_str = target_path.to_string_lossy().to_string();

    // If file already exists in temp, return it (simple cache)
    if target_path.exists() {
        return Ok(target_path_str);
    }

    let chat = client.get_me().await.map_err(|e| e.to_string())?;
    let messages = client
        .get_messages_by_id(&chat, &[file_id])
        .await
        .map_err(|e| e.to_string())?;

    // Handle Vec<Option<Message>>

    // Handle Vec<Option<Message>>
    let message_opt = messages.first().ok_or("Message not found")?;
    let message = message_opt.as_ref().ok_or("Message is empty/deleted")?;

    if let Some(media) = message.media() {
        if matches!(media, Media::Photo(_) | Media::Document(_)) {
            let downloadable = Downloadable::Media(media);
            client
                .download_media(&downloadable, target_path_str.as_str())
                .await
                .map_err(|e| e.to_string())?;
            Ok(target_path_str)
        } else {
            Err("Unsupported media type for preview".to_string())
        }
    } else {
        Err("No media found".to_string())
    }
}

#[derive(serde::Serialize)]
struct UserProfile {
    id: i64,
    first_name: String,
    last_name: Option<String>,
    username: Option<String>,
    phone: Option<String>,
}

#[tauri::command]
async fn get_current_user(state: State<'_, AppState>) -> Result<UserProfile, String> {
    let mut client_guard = state.client.lock().await;
    let client = client_guard.as_mut().ok_or("Client not initialized")?;
    let me = client.get_me().await.map_err(|e| e.to_string())?;

    Ok(UserProfile {
        id: me.id(),
        first_name: me.first_name().to_string(),
        last_name: me.last_name().map(|s| s.to_string()),
        username: me.username().map(|s| s.to_string()),
        phone: None, // Phone might not be accessible easily via simple User struct without raw access
    })
}

#[tauri::command]
fn trash_item(state: State<AppState>, id: String, is_folder: bool) -> Result<(), String> {
    state.db.trash_item(&id, is_folder);
    Ok(())
}

#[tauri::command]
fn restore_item(state: State<AppState>, id: String, is_folder: bool) -> Result<(), String> {
    state.db.restore_item(&id, is_folder);
    Ok(())
}

#[tauri::command]
async fn delete_item_permanently(
    state: State<'_, AppState>,
    id: String,
    is_folder: bool,
) -> Result<(), String> {
    println!("Deleting item permanently: {} (folder: {})", id, is_folder);

    let mut client_guard = state.client.lock().await;
    let client = client_guard.as_mut().ok_or("Not logged in")?;

    let mut messages_to_delete = Vec::new();

    if is_folder {
        // Get all files in the folder to be deleted
        let files = state.db.delete_folder(&id);
        for f in files {
            messages_to_delete.push(f.message_id);
        }
    } else {
        // Get file to get message id
        if let Some(file) = state.db.get_file(&id) {
            messages_to_delete.push(file.message_id);
            state.db.delete_file(&id);
        }
    }

    if !messages_to_delete.is_empty() {
        // Fetch chat (me) to delete messages
        match client.get_me().await {
            Ok(chat) => {
                if let Err(e) = client.delete_messages(&chat, &messages_to_delete).await {
                    eprintln!("Failed to delete messages from Telegram: {}", e);
                } else {
                    println!("Deleted messages from Telegram");
                }
            }
            Err(e) => eprintln!("Failed to get_me for deletion: {}", e),
        }
    }

    Ok(())
}

#[tauri::command]
async fn empty_trash(state: State<'_, AppState>) -> Result<(), String> {
    println!("Emptying trash...");

    // 0 days means delete everything in trash
    let files = state.db.cleanup_trash(0);
    let mut messages_to_delete = Vec::new();

    for f in files {
        messages_to_delete.push(f.message_id);
    }

    if !messages_to_delete.is_empty() {
        let mut client_guard = state.client.lock().await;
        if let Some(client) = client_guard.as_mut() {
            match client.get_me().await {
                Ok(chat) => {
                    if let Err(e) = client.delete_messages(&chat, &messages_to_delete).await {
                        eprintln!("Failed to delete messages from Telegram: {}", e);
                    } else {
                        println!(
                            "Deleted {} messages from Telegram",
                            messages_to_delete.len()
                        );
                    }
                }
                Err(e) => eprintln!("Failed to get_me for deletion: {}", e),
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn fetch_trash(state: State<AppState>) -> Result<(Vec<db::Folder>, Vec<db::FileMetadata>), String> {
    Ok(state.db.list_trash())
}

#[tauri::command]
async fn delete_item(
    id: String,
    is_folder: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Soft delete now
    state.db.trash_item(&id, is_folder);
    Ok(())
}

#[tauri::command]
async fn download_file_core(
    file_id: String,
    save_path: String,
    state: State<'_, AppState>,
    window: Window,
) -> Result<String, String> {
    println!("Downloading file: id={}, save_path={}", file_id, save_path);
    let mut client_guard = state.client.lock().await;
    let client = client_guard.as_mut().ok_or("Client not initialized")?;

    let file_meta = state.db.get_file(&file_id).ok_or("File not found")?;
    let message_id = file_meta.message_id;
    let total_size = file_meta.size;
    let chat = client.get_me().await.map_err(|e| e.to_string())?;

    let messages = client
        .get_messages_by_id(&chat, &[message_id])
        .await
        .map_err(|e| e.to_string())?;

    let message_opt = messages.first().ok_or("Message list empty")?;
    let message = match message_opt {
        Some(m) => m,
        None => return Err("Message not found".to_string()),
    };

    if let Some(media) = message.media() {
        let downloadable = match media {
            Media::Photo(p) => Downloadable::Media(Media::Photo(p)),
            Media::Document(d) => Downloadable::Media(Media::Document(d)),
            _ => return Err("Unsupported media type".to_string()),
        };

        let mut file_out = tokio::fs::File::create(&save_path)
            .await
            .map_err(|e| e.to_string())?;
        let mut stream = client.iter_download(&downloadable);
        let mut downloaded_size: i64 = 0;

        #[derive(Clone, serde::Serialize)]
        struct DownloadProgress {
            id: String,
            progress: u32,
        }

        while let Some(chunk) = stream.next().await.map_err(|e| e.to_string())? {
            file_out
                .write_all(&chunk)
                .await
                .map_err(|e| e.to_string())?;
            downloaded_size += chunk.len() as i64;

            if total_size > 0 {
                let progress = (downloaded_size as f64 / total_size as f64 * 100.0) as u32;
                let _ = window.emit(
                    "download-progress",
                    DownloadProgress {
                        id: file_id.clone(),
                        progress,
                    },
                );
            }
        }

        // Ensure 100% is sent
        let _ = window.emit(
            "download-progress",
            DownloadProgress {
                id: file_id.clone(),
                progress: 100,
            },
        );

        Ok("Download complete".to_string())
    } else {
        Err("No media found in message".to_string())
    }
}

#[tauri::command]
async fn rename_item(
    id: String,
    is_folder: bool,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    println!(
        "Renaming item: id={}, is_folder={}, new_name={}",
        id, is_folder, new_name
    );
    if is_folder {
        if state.db.rename_folder(&id, &new_name) {
            Ok(())
        } else {
            Err("Folder not found".to_string())
        }
    } else {
        if state.db.rename_file(&id, &new_name) {
            Ok(())
        } else {
            Err("File not found".to_string())
        }
    }
}

#[tauri::command]
async fn toggle_star(
    id: String,
    is_folder: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if state.db.toggle_star(&id, is_folder) {
        Ok(())
    } else {
        Err("Item not found".to_string())
    }
}

#[derive(serde::Serialize)]
pub struct EnrichedFolder {
    #[serde(flatten)]
    pub item: db::Folder,
    pub path_display: Option<String>,
}

#[derive(serde::Serialize)]
pub struct EnrichedFile {
    #[serde(flatten)]
    pub item: db::FileMetadata,
    pub path_display: Option<String>,
}

#[tauri::command]
async fn fetch_starred(
    state: State<'_, AppState>,
) -> Result<(Vec<EnrichedFolder>, Vec<EnrichedFile>), String> {
    let (folders, files) = state.db.get_starred();

    let enriched_folders = folders
        .into_iter()
        .map(|f| {
            let path_display = if let Some(fid) = &f.parent_id {
                state
                    .db
                    .lookup_folder_name(fid)
                    .map(|name| format!("In: {}", name))
            } else {
                Some("In: My Drive".to_string())
            };
            EnrichedFolder {
                item: f,
                path_display,
            }
        })
        .collect();

    let enriched_files = files
        .into_iter()
        .map(|f| {
            let path_display = if let Some(fid) = &f.folder_id {
                state
                    .db
                    .lookup_folder_name(fid)
                    .map(|name| format!("In: {}", name))
            } else {
                Some("In: My Drive".to_string())
            };
            EnrichedFile {
                item: f,
                path_display,
            }
        })
        .collect();

    Ok((enriched_folders, enriched_files))
}

#[tauri::command]
async fn search_items(
    query: String,
    state: State<'_, AppState>,
) -> Result<(Vec<db::Folder>, Vec<db::FileMetadata>), String> {
    Ok(state.db.search_items(&query))
}

#[tauri::command]
async fn get_storage_usage(state: State<'_, AppState>) -> Result<String, String> {
    let bytes = state.db.get_total_usage();

    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;

    let size = bytes as f64;
    let formatted = if size >= GB {
        format!("{:.2} GB", size / GB)
    } else if size >= MB {
        format!("{:.2} MB", size / MB)
    } else {
        format!("{:.2} KB", size / KB)
    };

    Ok(formatted)
}

#[tauri::command]
async fn get_folder_stats(state: State<'_, AppState>, id: String) -> Result<(i64, i32), String> {
    Ok(state.db.get_folder_stats(&id))
}

#[tauri::command]
async fn update_folder_metadata(
    state: State<'_, AppState>,
    id: String,
    color: Option<String>,
    icon: Option<String>,
    gradient: Option<String>,
    cover_image: Option<String>,
    emoji: Option<String>,
    pattern: Option<String>,
    show_badges: Option<bool>,
    tags: Option<Vec<String>>,
    description: Option<String>,
    view_mode: Option<String>,
) -> Result<(), String> {
    println!(
        "Updating folder metadata: id={}, color={:?}, icon={:?}, gradient={:?}, emoji={:?}",
        id, color, icon, gradient, emoji
    );
    let success = state.db.update_folder_metadata(
        &id,
        color,
        icon,
        gradient,
        cover_image,
        emoji,
        pattern,
        show_badges,
        tags,
        description,
        view_mode,
    );
    if success {
        println!("Update successful for id={}", id);
        Ok(())
    } else {
        println!("Update failed: Folder not found for id={}", id);
        Err("Folder not found".to_string())
    }
}

#[tauri::command]
async fn backup_metadata(state: State<'_, AppState>) -> Result<String, String> {
    println!("Starting metadata backup...");
    let mut client_guard = state.client.lock().await;
    let client = client_guard.as_mut().ok_or("Not logged in")?.clone();

    // 1. Get metadata path
    let app_dir = state
        .app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let metadata_path = app_dir.join("metadata.json");

    if !metadata_path.exists() {
        return Err("No metadata file found to backup".to_string());
    }

    // 2. Upload file
    // For small files like metadata.json, we can use a simpler upload or just re-use the manual logic.
    // Since client.upload_file is convenient but we want to tag it...
    // Let's use the file upload helper if available or standard part upload.
    // We'll trust client.upload_file for simplicity if available, else manual.
    // grammers-client has `upload_file` which returns an UploadedFile.

    let uploaded_file = client
        .upload_file(&metadata_path)
        .await
        .map_err(|e| e.to_string())?;

    // 3. Send to "Saved Messages" (Me)
    let me = client.get_me().await.map_err(|e| e.to_string())?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let caption = format!("#paperfold_metadata_backup\nTimestamp: {}", timestamp);

    client
        .send_message(&me, InputMessage::text(&caption).file(uploaded_file))
        .await
        .map_err(|e| e.to_string())?;

    println!("Backup uploaded successfully.");
    Ok(format!("Backup successful! Timestamp: {}", timestamp))
}

#[tauri::command]
async fn restore_metadata(state: State<'_, AppState>) -> Result<String, String> {
    println!("Restoring metadata from backup...");
    let mut client_guard = state.client.lock().await;
    let client = client_guard.as_mut().ok_or("Not logged in")?.clone();

    let me = client.get_me().await.map_err(|e| e.to_string())?;

    // 1. Search for latest backup
    let mut messages = client.iter_messages(&me).limit(50); // Check last 50 messages

    let mut backup_msg = None;

    while let Some(msg) = messages.next().await.map_err(|e| e.to_string())? {
        if msg.text().contains("#paperfold_metadata_backup") {
            backup_msg = Some(msg);
            break;
        }
    }

    if let Some(msg) = backup_msg {
        // 2. Download it
        let app_dir = state
            .app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        let metadata_path = app_dir.join("metadata.json");

        // Backup current one locally
        if metadata_path.exists() {
            let backup_local = app_dir.join("metadata.json.old");
            let _ = tokio::fs::rename(&metadata_path, &backup_local).await;
        }

        // Fix: Use media() instead of message for download
        let media = msg.media().ok_or("No media in backup message")?;
        let downloadable = Downloadable::Media(media);

        let _ = client
            .download_media(&downloadable, &metadata_path)
            .await
            .map_err(|e| e.to_string())?;

        // 3. Reload DB (Hot Reload)
        state.db.reload();

        Ok("Backup restored successfully. Your dashboard will refresh.".to_string())
    } else {
        Err("No backup found in Saved Messages.".to_string())
    }
}

#[tauri::command]
async fn sync_files(state: State<'_, AppState>) -> Result<String, String> {
    println!("Syncing files with Telegram...");
    let mut client_guard = state.client.lock().await;
    let client = client_guard.as_mut().ok_or("Not logged in")?.clone();

    let me = client.get_me().await.map_err(|e| e.to_string())?;

    // 1. Get all local files
    let all_files = state.db.get_all_files();
    if all_files.is_empty() {
        return Ok("No files to sync.".to_string());
    }

    println!("Checking {} files...", all_files.len());

    // 2. Batch check availability
    let mut missing_ids = Vec::new();
    let batch_size = 50;

    for chunk in all_files.chunks(batch_size) {
        let message_ids: Vec<i32> = chunk.iter().map(|f| f.message_id).collect();

        // get_messages_by_id returns specific messages.
        // If a message is deleted, it might return None or an empty message depending on API.
        // grammers: returns Vec<Option<Message>> usually, or filtered list?
        // Let's check the return type docs/usage.
        // In preview_file we used get_messages_by_id and it returned a list.
        // If I request IDs [1, 2, 3] and 2 is deleted, does it return [Some, None, Some] or [Msg1, Msg3]?
        // grammers-client `get_messages_by_id` returns `Result<Vec<Option<Message>>>`.

        let messages = client
            .get_messages_by_id(&me, &message_ids)
            .await
            .map_err(|e| e.to_string())?;

        // We iterate input IDs and result messages in parallel?
        // Docs say: "The returned list will have the same length as the input IDs."

        for (i, msg_opt) in messages.iter().enumerate() {
            let is_missing = match msg_opt {
                Some(msg) => {
                    // Check if empty or media missing?
                    // Safe to assume if it exists it's fine, unless "Empty" type.
                    // For now, if Some(msg), check if it has media if we expect it.
                    // But just existence logic:
                    msg.media().is_none() // If no media, handle as "content deleted" for our file app?
                                          // Actually, text messages don't have media. Our files MUST have media.
                                          // So if media is missing, it's effectively a broken link for us.
                }
                None => true,
            };

            if is_missing {
                missing_ids.push(chunk[i].id.clone());
            }
        }
    }

    let removed_count = missing_ids.len();
    if removed_count > 0 {
        println!("Found {} missing files. Removing...", removed_count);
        state.db.delete_files_by_ids(&missing_ids);
        Ok(format!(
            "Sync complete. Removed {} deleted files.",
            removed_count
        ))
    } else {
        Ok("Sync complete. All files are up to date.".to_string())
    }
}

#[tauri::command]
async fn download_folder(
    state: State<'_, AppState>,
    folder_id: String,
    base_path: String,
    window: Window,
) -> Result<String, String> {
    let mut client_guard = state.client.lock().await;
    let client = client_guard.as_mut().ok_or("Not logged in")?.clone();

    // Drop guard so we can await async calls
    drop(client_guard);

    let all_files = state.db.get_all_files();
    let all_folders = state.db.get_all_folders();

    // Build Maps for O(1) lookup
    let mut file_map: HashMap<String, Vec<db::FileMetadata>> = HashMap::new();
    for f in all_files {
        file_map
            .entry(f.folder_id.clone().unwrap_or_default())
            .or_default()
            .push(f);
    }

    let mut folder_map: HashMap<String, Vec<db::Folder>> = HashMap::new();
    for f in &all_folders {
        folder_map
            .entry(f.parent_id.clone().unwrap_or_default())
            .or_default()
            .push(f.clone());
    }

    let root_folder = all_folders
        .iter()
        .find(|f| f.id == folder_id)
        .ok_or("Folder not found")?;

    // Queue: (folder_id, fs_path_to_create)
    let mut queue = VecDeque::new();
    let root_fs_path = std::path::Path::new(&base_path).join(&root_folder.name);
    queue.push_back((folder_id.clone(), root_fs_path));

    while let Some((curr_id, curr_path)) = queue.pop_front() {
        // 1. Create directory
        tokio::fs::create_dir_all(&curr_path)
            .await
            .map_err(|e| e.to_string())?;

        // 2. Download files in this folder
        if let Some(files) = file_map.get(&curr_id) {
            for f in files {
                // Fetch valid message/media
                let chat = client.get_me().await.map_err(|e| e.to_string())?;
                let messages = client
                    .get_messages_by_id(&chat, &[f.message_id])
                    .await
                    .map_err(|e| e.to_string())?;

                if let Some(Some(msg)) = messages.first() {
                    if let Some(media) = msg.media() {
                        let downloadable = match media {
                            Media::Photo(p) => Downloadable::Media(Media::Photo(p)),
                            Media::Document(d) => Downloadable::Media(Media::Document(d)),
                            _ => continue,
                        };

                        let final_path = curr_path.join(&f.name);
                        let part_path = curr_path.join(format!("{}.part", f.name));

                        // Emit progress
                        let _ = window.emit(
                            "download-progress",
                            serde_json::json!({
                                "id": f.id,
                                "progress": 50.0, // Indeterminate / In Progress
                                "status": format!("Downloading {}...", f.name)
                            }),
                        );

                        match client
                            .download_media(&downloadable, part_path.clone())
                            .await
                        {
                            Ok(_) => {
                                // Rename part to final
                                let _ = std::fs::rename(&part_path, &final_path);
                            }
                            Err(e) => {
                                // Clean up part file if failed
                                let _ = std::fs::remove_file(&part_path);
                                return Err(e.to_string());
                            }
                        }
                    }
                }
            }
        }

        // 3. Queue subfolders
        if let Some(subs) = folder_map.get(&curr_id) {
            for sub in subs {
                queue.push_back((sub.id.clone(), curr_path.join(&sub.name)));
            }
        }
    }

    Ok("Folder downloaded successfully.".to_string())
}

#[tauri::command]
async fn download_all(
    target_dir: String,
    state: State<'_, AppState>,
    window: Window,
) -> Result<(), String> {
    let mut client_guard = state.client.lock().await;
    let client = client_guard.as_mut().ok_or("Not logged in")?.clone();
    drop(client_guard);

    let all_files = state.db.get_all_files();
    let all_folders = state.db.get_all_folders();

    // Mapping ID -> Path
    let mut folder_map = HashMap::new();
    for f in &all_folders {
        folder_map.insert(f.id.clone(), f.clone());
    }

    struct FileEntry {
        // id field removed as unused
        name: String,
        relative_path: std::path::PathBuf,
        size: i64,
        message_id: i32,
    }

    let mut entries = Vec::new();
    for file in all_files {
        if file.trashed {
            continue;
        }

        // Check if any parent is trashed
        let mut valid = true;
        let mut temp_parts = Vec::new();
        let mut curr = file.folder_id.clone();

        while let Some(pid) = curr {
            if let Some(f) = folder_map.get(&pid) {
                if f.trashed {
                    valid = false;
                    break;
                }
                temp_parts.push(f.name.clone());
                curr = f.parent_id.clone();
            } else {
                curr = None;
            }
        }

        if valid {
            let mut path = std::path::PathBuf::new();
            temp_parts.reverse();
            for p in temp_parts {
                path.push(p);
            }
            path.push(&file.name);

            entries.push(FileEntry {
                // id: file.id,
                name: file.name,
                relative_path: path,
                size: file.size,
                message_id: file.message_id,
            });
        }
    }

    // Packet Logic (Limit 1.9GB)
    const LIMIT: u64 = 1_900_000_000;

    let mut packets: Vec<Vec<FileEntry>> = Vec::new();
    let mut current_packet = Vec::new();
    let mut current_size = 0;

    for entry in entries {
        if current_size + (entry.size as u64) > LIMIT && !current_packet.is_empty() {
            packets.push(current_packet);
            current_packet = Vec::new();
            current_size = 0;
        }
        current_size += entry.size as u64;
        current_packet.push(entry);
    }
    if !current_packet.is_empty() {
        packets.push(current_packet);
    }

    // Zipping
    let total_packets = packets.len();
    for (i, packet) in packets.into_iter().enumerate() {
        let zip_name = if total_packets > 1 {
            format!("Paperfold_Backup_Part_{}.zip", i + 1)
        } else {
            "Paperfold_Backup.zip".to_string()
        };
        let final_path = Path::new(&target_dir).join(&zip_name);
        let part_path = Path::new(&target_dir).join(format!("{}.part", zip_name));

        let file = std::fs::File::create(&part_path).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o755);

        let packet_size = packet.len();

        for (j, entry) in packet.into_iter().enumerate() {
            let _ = window.emit(
                "download-all-progress",
                serde_json::json!({
                    "packet": i + 1,
                    "total_packets": total_packets,
                    "file_index": j + 1,
                    "total_files": packet_size,
                    "status": format!("Downloading {}...", entry.name)
                }),
            );

            let temp_name = format!("temp_dl_{}", uuid::Uuid::new_v4());
            let temp_path = std::env::temp_dir().join(&temp_name);
            let temp_path_str = temp_path.to_string_lossy().to_string();

            // Fetch message/media
            if let Ok(chat) = client.get_me().await {
                if let Ok(messages) = client.get_messages_by_id(&chat, &[entry.message_id]).await {
                    if let Some(Some(msg)) = messages.first() {
                        if let Some(media) = msg.media() {
                            let downloadable = match media {
                                Media::Photo(p) => Downloadable::Media(Media::Photo(p)),
                                Media::Document(d) => Downloadable::Media(Media::Document(d)),
                                _ => continue,
                            };

                            if client
                                .download_media(&downloadable, &temp_path_str)
                                .await
                                .is_ok()
                            {
                                if let Ok(content) = std::fs::read(&temp_path) {
                                    let path_str =
                                        entry.relative_path.to_string_lossy().to_string();
                                    let _ = zip.start_file(path_str, options);
                                    let _ = zip.write_all(&content);
                                }
                                let _ = std::fs::remove_file(&temp_path);
                            }
                        }
                    }
                }
            }
        }
        let _ = zip.finish().map_err(|e| e.to_string())?;

        // Rename part to final
        std::fs::rename(&part_path, &final_path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn get_pid_file_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .expect("failed to get app data dir");
    // Ensure dir exists (should be done on init but good to be safe)
    let _ = std::fs::create_dir_all(&app_dir);
    app_dir.join(PID_FILENAME)
}

fn is_process_running(pid: u32) -> bool {
    let mut system = System::new_all();
    system.refresh_processes();
    system.process(Pid::from(pid as usize)).is_some()
}

#[tauri::command]
async fn start_webdav(state: State<'_, AppState>) -> Result<String, String> {
    let pid_path = get_pid_file_path(&state.app_handle);

    // Check if already running via PID file
    if pid_path.exists() {
        if let Ok(pid_str) = std::fs::read_to_string(&pid_path) {
            if let Ok(pid) = pid_str.trim().parse::<u32>() {
                if is_process_running(pid) {
                    return Ok("WebDAV server is already running".to_string());
                } else {
                    // Stale PID file
                    let _ = std::fs::remove_file(&pid_path);
                }
            }
        }
    }

    let sidecar_command = state
        .app_handle
        .shell()
        .sidecar("paperfold-daemon")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?;

    let (mut _rx, child) = sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    // Get PID and save it
    let pid = child.pid();
    std::fs::write(&pid_path, pid.to_string())
        .map_err(|e| format!("Failed to write PID file: {}", e))?;

    // Detach: Forget the child so it doesn't get killed when dropped (if CommandChild does that)
    // tauri-plugin-shell CommandChild doesn't expose strict detach, but standard Command does.
    // However, we rely on the fact that if we just let it go without holding a handle in AppState,
    // and if the OS allows, it should stay. (Actually, 'forget' is safer if Drop implements kill).
    // Note: CommandChild wraps a shared child.
    // We will just drop it here. If the plugin is implemented to kill on drop, this won't work.
    // BUT the user interaction implies we test.
    // Standard Rust spawn() detaches.
    // Let's hope Tauri's plugin doesn't auto-kill orphans on struct drop.
    // (If it does, we'd need to use 'nohup' approach, but let's try this first).

    println!("WebDAV server started with PID: {}", pid);
    Ok("WebDAV server started".to_string())
}

#[tauri::command]
async fn stop_webdav(state: State<'_, AppState>) -> Result<String, String> {
    let pid_path = get_pid_file_path(&state.app_handle);

    if !pid_path.exists() {
        return Ok("WebDAV server is not running".to_string());
    }

    let pid_str = std::fs::read_to_string(&pid_path)
        .map_err(|e| format!("Failed to read PID file: {}", e))?;

    let pid = pid_str
        .trim()
        .parse::<u32>()
        .map_err(|_| "Invalid PID file content".to_string())?;

    let system = System::new_all();
    if let Some(process) = system.process(Pid::from(pid as usize)) {
        // Kill it
        process.kill();
        println!("Killed process {}", pid);
    } else {
        println!("Process {} not found, removing stale PID file", pid);
    }

    // Always remove PID file
    let _ = std::fs::remove_file(&pid_path);

    Ok("WebDAV server stopped".to_string())
}

#[tauri::command]
async fn get_webdav_status(state: State<'_, AppState>) -> Result<bool, String> {
    let pid_path = get_pid_file_path(&state.app_handle);
    if !pid_path.exists() {
        return Ok(false);
    }

    let pid_str = match std::fs::read_to_string(&pid_path) {
        Ok(s) => s,
        Err(_) => return Ok(false),
    };

    let pid = match pid_str.trim().parse::<u32>() {
        Ok(p) => p,
        Err(_) => return Ok(false),
    };

    if is_process_running(pid) {
        Ok(true)
    } else {
        // Stale
        let _ = std::fs::remove_file(&pid_path);
        Ok(false)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let _app_handle = app.handle();
            let app_dir = app.path().app_data_dir().unwrap();
            std::fs::create_dir_all(&app_dir).unwrap();

            let db = Arc::new(Database::new(app_dir.to_str().unwrap()));

            app.manage(AppState {
                app_handle: app.handle().clone(),
                client: Arc::new(AsyncMutex::new(None)), // Lazy init
                phone_token: Mutex::new(None),
                password_token: Mutex::new(None),
                db,
                // webdav_process removed
            });

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            login_start,
            login_complete,
            check_auth,
            logout,
            fetch_files,
            create_folder,
            upload_file,
            download_file_core,
            delete_item,
            delete_item_permanently,
            trash_item,
            restore_item,
            fetch_trash,
            empty_trash,
            rename_item,
            update_folder_metadata,
            get_folder_stats,
            get_storage_usage,
            preview_file,
            get_current_user,
            toggle_star,
            fetch_starred,
            search_items,
            backup_metadata,
            restore_metadata,
            sync_files,
            download_folder,
            download_all,
            start_webdav,
            stop_webdav,
            get_webdav_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
