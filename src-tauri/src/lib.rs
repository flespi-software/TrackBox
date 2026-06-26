#[cfg(desktop)]
fn show_main(app: &tauri::AppHandle) {
  use tauri::Manager;
  if let Some(w) = app.get_webview_window("main") {
    let _ = w.show();
    let _ = w.unminimize();
    let _ = w.set_focus();
  }
}

#[cfg(desktop)]
fn toggle_main(app: &tauri::AppHandle) {
  use tauri::Manager;
  if let Some(w) = app.get_webview_window("main") {
    let visible = w.is_visible().unwrap_or(false);
    let minimized = w.is_minimized().unwrap_or(false);
    if visible && !minimized {
      let _ = w.hide();
    } else {
      let _ = w.show();
      let _ = w.unminimize();
      let _ = w.set_focus();
    }
  }
}

/// Load the per-install Stronghold salt, generating a random 16-byte one on first
/// run. A salt is not a secret (stored in plaintext next to the vault); using a
/// unique random salt per install instead of a hardcoded constant means one
/// precomputed table can't be reused to crack many users' vaults.
fn load_or_create_salt(path: &std::path::Path) -> Vec<u8> {
  if let Ok(bytes) = std::fs::read(path) {
    if bytes.len() == 16 {
      return bytes;
    }
  }
  let mut salt = [0u8; 16];
  getrandom::getrandom(&mut salt).expect("failed to generate vault salt");
  // Best-effort persist; if writing fails we still use this salt for the session.
  let _ = std::fs::write(path, salt);
  salt.to_vec()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[allow(unused_mut)]
  let mut builder = tauri::Builder::default();

  // Single-instance lock: launching a second copy just focuses the window that's
  // already running (raising it from the tray if hidden) instead of starting a
  // duplicate. Must be registered before any other plugin (Tauri requirement).
  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      show_main(app);
    }));
  }

  builder
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_process::init())
    .setup(|app| {
      use tauri::Manager;

      // Encrypted secret vault. Derive the snapshot key from the master password
      // with Argon2id over a per-install random salt. Stored in the LOCAL (non-
      // roaming) app data dir — the canonical spot for secrets/machine-bound state
      // (~/.local/share on Linux, Application Support on macOS, %LOCALAPPDATA% on
      // Windows). Must match the vault dir in src/secureStore.js (appLocalDataDir).
      let salt = {
        let dir = app.path().app_local_data_dir().expect("no app local data dir");
        let _ = std::fs::create_dir_all(&dir);
        load_or_create_salt(&dir.join("vault.salt"))
      };
      app.handle().plugin(
        tauri_plugin_stronghold::Builder::new(move |password| {
          use argon2::{hash_raw, Config, Variant, Version};
          let config = Config {
            lanes: 2,
            mem_cost: 10_000,
            time_cost: 2,
            variant: Variant::Argon2id,
            version: Version::Version13,
            ..Default::default()
          };
          hash_raw(password.as_ref(), &salt, &config).expect("failed to hash password")
        })
        .build(),
      )?;

      #[cfg(desktop)]
      {
        use tauri::menu::{Menu, MenuItem};
        use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

        app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

        // System tray with Show / Quit. Double-click shows the window; the
        // tooltip (with the running-simulator count) is updated from JS. The app
        // name comes from tauri.conf.json (productName) so a rename is one place.
        let app_name = app.config().product_name.clone().unwrap_or_else(|| "App".into());
        let show_i = MenuItem::with_id(app, "show", format!("Show {app_name}"), true, None::<&str>)?;
        let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
        TrayIconBuilder::with_id("main-tray")
          .icon(app.default_window_icon().unwrap().clone())
          .tooltip(&app_name)
          .menu(&menu)
          .show_menu_on_left_click(false)
          .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            // Tray Quit exits immediately; the in-app Quit asks for confirmation.
            "quit" => app.exit(0),
            _ => {}
          })
          .on_tray_icon_event(|tray, event| {
            // Left-click toggles the window; right-click opens the menu.
            if let TrayIconEvent::Click {
              button: MouseButton::Left,
              button_state: MouseButtonState::Up,
              ..
            } = event
            {
              toggle_main(tray.app_handle());
            }
          })
          .build(app)?;

        // Closing the window hides it to the tray instead of quitting, so the
        // simulator keeps running in the background.
        if let Some(window) = app.get_webview_window("main") {
          let w = window.clone();
          window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
              api.prevent_close();
              let _ = w.hide();
            }
          });
        }
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
