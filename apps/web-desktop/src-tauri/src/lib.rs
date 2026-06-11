// Stockage securise (trousseau OS) expose au frontend via 3 commandes.
// Le frontend (zustand persist) y stocke le blob JSON d'auth au lieu du
// localStorage, qui est lisible par tout JS de la webview.
const KEYRING_SERVICE: &str = "optipack-desktop";

#[tauri::command]
fn secure_get(key: String) -> Option<String> {
    keyring::Entry::new(KEYRING_SERVICE, &key)
        .ok()?
        .get_password()
        .ok()
}

#[tauri::command]
fn secure_set(key: String, value: String) -> Result<(), String> {
    keyring::Entry::new(KEYRING_SERVICE, &key)
        .map_err(|e| e.to_string())?
        .set_password(&value)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn secure_del(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        // Absent = deja propre, on considere ok (idempotent).
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![secure_get, secure_set, secure_del])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
