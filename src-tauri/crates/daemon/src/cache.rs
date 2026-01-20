use grammers_client::types::Chat;
use grammers_client::Client;
use paperfold_core::db::FileMetadata;
use std::path::PathBuf;
use tokio::fs;

#[derive(Debug, Clone)]
pub struct CacheManager {
    cache_dir: PathBuf,
}

impl CacheManager {
    pub fn new(app_dir: &std::path::Path) -> Self {
        let cache_dir = app_dir.join("cache");
        if !cache_dir.exists() {
            std::fs::create_dir_all(&cache_dir).expect("Failed to create cache directory");
        }
        Self { cache_dir }
    }

    pub async fn get_file(
        &self,
        metadata: &FileMetadata,
        client: &Client,
        me: &Chat,
    ) -> Result<PathBuf, String> {
        // Sanitize name or just use ID to avoid issues?
        // Using ID_Name for debuggability.
        let safe_name = metadata.name.replace("/", "_");
        let file_name = format!("{}_{}", metadata.id, safe_name);
        let path = self.cache_dir.join(file_name);

        // Check if exists and valid
        if path.exists() {
            if let Ok(meta) = fs::metadata(&path).await {
                if meta.len() == metadata.size as u64 {
                    return Ok(path);
                }
            }
            // Invalid size or other issue, re-download
            let _ = fs::remove_file(&path).await;
        }

        if metadata.message_id == -1 {
            // Empty synthetic file
            fs::File::create(&path).await.map_err(|e| e.to_string())?;
            return Ok(path);
        }

        // Download
        let messages = client
            .get_messages_by_id(me, &[metadata.message_id])
            .await
            .map_err(|e| e.to_string())?;

        let message = messages
            .first()
            .and_then(|m| m.as_ref())
            .ok_or_else(|| "Message not found".to_string())?;

        // grammers download_media takes a string path
        let path_str = path.to_string_lossy().to_string();
        message
            .download_media(&path_str)
            .await
            .map_err(|e| e.to_string())?;

        Ok(path)
    }

    // Basic cleanup logic (optional: LRU later)
    #[allow(dead_code)]
    pub async fn clear_cache(&self) {
        let _ = fs::remove_dir_all(&self.cache_dir).await;
        let _ = fs::create_dir_all(&self.cache_dir).await;
    }
}
