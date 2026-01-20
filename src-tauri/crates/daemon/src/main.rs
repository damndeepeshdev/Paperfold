use dav_server::DavHandler;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

mod cache;
mod fs;

#[tokio::main]
async fn main() {
    env_logger::init();
    dotenv::dotenv().ok();

    let addr = SocketAddr::from(([127, 0, 0, 1], 17432));
    println!("WebDAV server listening on http://{}", addr);

    let home = std::env::var("HOME").unwrap(); // Mac/Linux
    let app_dir = PathBuf::from(home).join("Library/Application Support/com.damndeepesh.paperfold");
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir).unwrap();
    }
    let session_path = app_dir.join("telegram.session");

    let api_id_str = std::env::var("TELEGRAM_API_ID").unwrap_or_else(|_| "0".to_string());
    let api_hash = std::env::var("TELEGRAM_API_HASH").unwrap_or_default();
    let api_id = api_id_str.parse::<i32>().unwrap_or(0);

    if api_id == 0 {
        eprintln!("API_ID_MISSING");
    }

    let db = Arc::new(paperfold_core::Database::new(app_dir.to_str().unwrap()));

    let client = match paperfold_core::client::connect(&session_path, api_id, &api_hash).await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to connect to Telegram: {}", e);
            if api_id != 0 {
                return;
            }
            return;
        }
    };

    let me = client.get_me().await.unwrap();
    let cache = std::sync::Arc::new(crate::cache::CacheManager::new(&app_dir));
    let fs = fs::PaperfoldFS::new(db, client, grammers_client::types::Chat::User(me), cache);

    let dav_server = DavHandler::builder()
        .filesystem(Box::new(fs))
        .locksystem(dav_server::memls::MemLs::new())
        .build_handler();

    let make_service = hyper::service::make_service_fn(move |_| {
        let dav_server = dav_server.clone();
        async move {
            let func = move |req: hyper::Request<hyper::Body>| {
                let dav_server = dav_server.clone();
                async move { Ok::<_, hyper::Error>(dav_server.handle(req).await) }
            };
            Ok::<_, hyper::Error>(hyper::service::service_fn(func))
        }
    });

    let server = hyper::Server::bind(&addr).serve(make_service);
    if let Err(e) = server.await {
        eprintln!("Server error: {}", e);
    }
}
