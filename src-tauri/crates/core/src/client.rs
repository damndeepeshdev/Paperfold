use grammers_client::{Client, Config, InitParams};
use grammers_session::Session;
use std::path::Path;

pub mod utils {
    use base64::{engine::general_purpose, Engine as _};
    use grammers_client::types::{Downloadable, Media};

    pub async fn extract_thumbnail_base64(
        client: &grammers_client::Client,
        message: &grammers_client::types::Message,
    ) -> Option<String> {
        let media = message.media()?;
        let thumbs = match &media {
            Media::Photo(photo) => photo.thumbs(),
            Media::Document(doc) => doc.thumbs(),
            _ => Vec::new(),
        };

        if thumbs.is_empty() {
            return None;
        }

        let thumb = thumbs
            .iter()
            .find(|t| t.photo_type() == "m")
            .or_else(|| thumbs.iter().find(|t| t.photo_type() == "s"))
            .or_else(|| thumbs.iter().find(|t| t.photo_type() == "w"))
            .or_else(|| thumbs.last())
            .or_else(|| thumbs.first())
            .cloned()?;

        let temp_name = format!("thumb_{}.jpg", rand::random::<u32>());
        let temp_path = std::env::temp_dir().join(temp_name);
        let temp_path_str = temp_path.to_string_lossy().to_string();

        match client
            .download_media(&Downloadable::PhotoSize(thumb.clone()), &temp_path_str)
            .await
        {
            Ok(_) => {
                if let Ok(bytes) = std::fs::read(&temp_path) {
                    let _ = std::fs::remove_file(temp_path);
                    Some(general_purpose::STANDARD_NO_PAD.encode(&bytes))
                } else {
                    None
                }
            }
            Err(_) => {
                let _ = std::fs::remove_file(temp_path);
                None
            }
        }
    }
}

pub async fn connect(session_file: &Path, api_id: i32, api_hash: &str) -> Result<Client, String> {
    if !session_file.exists() {
        return Err("Session file not found".to_string());
    }

    let session = Session::load_file_or_create(session_file).map_err(|e| e.to_string())?;

    let params = InitParams {
        device_model: "Paperfold Desktop".to_string(),
        app_version: "0.1.0".to_string(),
        system_version: "macOS".to_string(),
        ..Default::default()
    };

    let config = Config {
        session,
        api_id,
        api_hash: api_hash.to_string(),
        params,
    };

    Client::connect(config).await.map_err(|e| e.to_string())
}
