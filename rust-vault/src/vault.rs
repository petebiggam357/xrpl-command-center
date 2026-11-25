use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use zeroize::Zeroizing;

use crate::xrpl_crypto::{derive_keypair_from_seed, generate_family_seed, sign_canonical_payload, KeyAlgorithm};

const VAULT_FILENAME: &str = "wallet-vault-rust.enc.json";
const VERIFIER_MAGIC: &str = "XRPL_CC_RUST_VAULT_V1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletAccountPublic {
    pub id: String,
    pub label: String,
    pub address: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub algorithm: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub derivation_path: Option<String>,
    pub created_at: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultDiskFile {
    version: u8,
    kdf: String,
    vault_initialized: bool,
    salt_hex: Option<String>,
    nonce_hex: Option<String>,
    ciphertext_b64: Option<String>,
    accounts: Vec<WalletAccountPublic>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SecretPayload {
    verifier: String,
    seeds: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatusOut {
    pub initialized: bool,
    pub unlocked: bool,
    pub backend: &'static str,
    pub kdf: &'static str,
    pub pid: u32,
    pub accounts: Vec<WalletAccountPublic>,
}

pub struct RustVaultEngine {
    storage_dir: PathBuf,
    unlocked_seeds: Option<HashMap<String, Zeroizing<String>>>,
    derived_key: Option<Zeroizing<[u8; 32]>>,
    salt: Option<[u8; 32]>,
}

impl Drop for RustVaultEngine {
    fn drop(&mut self) {
        self.lock();
    }
}

impl RustVaultEngine {
    pub fn new(storage_dir: PathBuf) -> Self {
        Self {
            storage_dir,
            unlocked_seeds: None,
            derived_key: None,
            salt: None,
        }
    }

    fn vault_path(&self) -> PathBuf {
        self.storage_dir.join(VAULT_FILENAME)
    }

    fn derive_argon2id_key(passphrase: &str, salt: &[u8; 32]) -> Result<Zeroizing<[u8; 32]>, String> {
        // OWASP-aligned Argon2id parameters: 64 MiB memory, 3 iterations, 1 lane
        let params = Params::new(65_536, 3, 1, Some(32))
            .map_err(|e| format!("Argon2id param error: {e}"))?;
        let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
        let mut out = Zeroizing::new([0u8; 32]);
        argon2
            .hash_password_into(passphrase.as_bytes(), salt, &mut *out)
            .map_err(|e| format!("Argon2id KDF error: {e}"))?;
        Ok(out)
    }

    fn load_disk(&self) -> VaultDiskFile {
        match fs::read_to_string(self.vault_path()) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or(VaultDiskFile {
                version: 1,
                kdf: "argon2id".to_string(),
                vault_initialized: false,
                salt_hex: None,
                nonce_hex: None,
                ciphertext_b64: None,
                accounts: vec![],
            }),
            Err(_) => VaultDiskFile {
                version: 1,
                kdf: "argon2id".to_string(),
                vault_initialized: false,
                salt_hex: None,
                nonce_hex: None,
                ciphertext_b64: None,
                accounts: vec![],
            },
        }
    }

    fn save_disk(&self, disk: &VaultDiskFile) -> Result<(), String> {
        fs::create_dir_all(&self.storage_dir).map_err(|e| format!("mkdir failed: {e}"))?;
        let tmp_path = self.storage_dir.join(format!("{VAULT_FILENAME}.tmp"));
        let serialized = serde_json::to_string_pretty(disk).map_err(|e| format!("json error: {e}"))?;
        fs::write(&tmp_path, serialized).map_err(|e| format!("write failed: {e}"))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&tmp_path, fs::Permissions::from_mode(0o600));
        }

        fs::rename(&tmp_path, self.vault_path()).map_err(|e| format!("atomic rename failed: {e}"))?;
        Ok(())
    }

    fn encrypt_seeds(
        seeds: &HashMap<String, Zeroizing<String>>,
        key: &[u8; 32],
    ) -> Result<(String, String), String> {
        let mut plain_map = HashMap::with_capacity(seeds.len());
        for (k, v) in seeds {
            plain_map.insert(k.clone(), v.as_str().to_string());
        }
        let payload = SecretPayload {
            verifier: VERIFIER_MAGIC.to_string(),
            seeds: plain_map,
        };
        let plain_json = Zeroizing::new(
            serde_json::to_string(&payload).map_err(|e| format!("serialize error: {e}"))?,
        );

        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "AES-256-GCM init error".to_string())?;
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce_bytes), plain_json.as_bytes())
            .map_err(|_| "AES-256-GCM encryption failed".to_string())?;

        Ok((hex::encode(nonce_bytes), B64.encode(ciphertext)))
    }

    pub fn get_status(&self) -> VaultStatusOut {
        let disk = self.load_disk();
        VaultStatusOut {
            initialized: disk.vault_initialized,
            unlocked: self.unlocked_seeds.is_some(),
            backend: "rust-sidecar",
            kdf: "argon2id+aes-256-gcm+zeroize",
            pid: std::process::id(),
            accounts: disk.accounts,
        }
    }

    pub fn setup_vault(&mut self, passphrase: &str) -> Result<VaultStatusOut, String> {
        if passphrase.len() < 8 {
            return Err("Master passphrase must be at least 8 characters.".to_string());
        }
        let disk = self.load_disk();
        if disk.vault_initialized {
            return Err("Vault is already initialized. Unlock with your passphrase.".to_string());
        }

        let mut salt = [0u8; 32];
        OsRng.fill_bytes(&mut salt);
        let key = Self::derive_argon2id_key(passphrase, &salt)?;
        let seeds: HashMap<String, Zeroizing<String>> = HashMap::new();
        let (nonce_hex, ciphertext_b64) = Self::encrypt_seeds(&seeds, &key)?;

        self.save_disk(&VaultDiskFile {
            version: 1,
            kdf: "argon2id".to_string(),
            vault_initialized: true,
            salt_hex: Some(hex::encode(salt)),
            nonce_hex: Some(nonce_hex),
            ciphertext_b64: Some(ciphertext_b64),
            accounts: disk.accounts,
        })?;

        self.unlocked_seeds = Some(seeds);
        self.derived_key = Some(key);
        self.salt = Some(salt);
        Ok(self.get_status())
    }

    pub fn unlock(&mut self, passphrase: &str) -> Result<VaultStatusOut, String> {
        let disk = self.load_disk();
        if !disk.vault_initialized {
            return Err("Encrypted Rust vault is not initialized yet.".to_string());
        }
        let salt_hex = disk.salt_hex.ok_or("Corrupt vault: missing salt")?;
        let nonce_hex = disk.nonce_hex.ok_or("Corrupt vault: missing nonce")?;
        let ct_b64 = disk.ciphertext_b64.ok_or("Corrupt vault: missing ciphertext")?;

        let salt_vec = hex::decode(salt_hex).map_err(|_| "Corrupt salt hex")?;
        let nonce_vec = hex::decode(nonce_hex).map_err(|_| "Corrupt nonce hex")?;
        if salt_vec.len() != 32 || nonce_vec.len() != 12 {
            return Err("Corrupt vault header sizes".to_string());
        }
        let mut salt = [0u8; 32];
        salt.copy_from_slice(&salt_vec);

        let key = Self::derive_argon2id_key(passphrase, &salt)?;
        let ct_bytes = B64.decode(ct_b64).map_err(|_| "Corrupt base64 ciphertext")?;
        let cipher = Aes256Gcm::new_from_slice(&*key).map_err(|_| "AES init failed")?;

        let plain_bytes = Zeroizing::new(
            cipher
                .decrypt(Nonce::from_slice(&nonce_vec), ct_bytes.as_ref())
                .map_err(|_| "Incorrect vault passphrase.".to_string())?,
        );
        let plain_str = Zeroizing::new(
            String::from_utf8(plain_bytes.to_vec()).map_err(|_| "Vault UTF-8 error")?,
        );
        let parsed: SecretPayload =
            serde_json::from_str(&plain_str).map_err(|_| "Vault JSON integrity error")?;
        if parsed.verifier != VERIFIER_MAGIC {
            return Err("Vault verifier mismatch".to_string());
        }

        let mut z_seeds = HashMap::with_capacity(parsed.seeds.len());
        for (id, seed) in parsed.seeds {
            z_seeds.insert(id, Zeroizing::new(seed));
        }

        self.unlocked_seeds = Some(z_seeds);
        self.derived_key = Some(key);
        self.salt = Some(salt);
        Ok(self.get_status())
    }

    pub fn lock(&mut self) -> VaultStatusOut {
        // Dropping Zeroizing<String> and Zeroizing<[u8; 32]> deterministically scrubs RAM
        self.unlocked_seeds = None;
        self.derived_key = None;
        self.salt = None;
        self.get_status()
    }

    fn persist_unlocked(&self, accounts: Vec<WalletAccountPublic>) -> Result<(), String> {
        let seeds = self.unlocked_seeds.as_ref().ok_or("Vault is locked.")?;
        let key = self.derived_key.as_ref().ok_or("Vault is locked.")?;
        let salt = self.salt.as_ref().ok_or("Vault is locked.")?;

        let (nonce_hex, ciphertext_b64) = Self::encrypt_seeds(seeds, key)?;
        self.save_disk(&VaultDiskFile {
            version: 1,
            kdf: "argon2id".to_string(),
            vault_initialized: true,
            salt_hex: Some(hex::encode(salt)),
            nonce_hex: Some(nonce_hex),
            ciphertext_b64: Some(ciphertext_b64),
            accounts,
        })
    }

    pub fn create_wallet(
        &mut self,
        label: &str,
        algorithm_str: &str,
        now_ms: u64,
    ) -> Result<(WalletAccountPublic, String, VaultStatusOut), String> {
        if self.unlocked_seeds.is_none() {
            return Err("Unlock or initialize your encrypted vault first.".to_string());
        }
        let algo = if algorithm_str == "ecdsa-secp256k1" {
            KeyAlgorithm::Secp256k1
        } else {
            KeyAlgorithm::Ed25519
        };

        let seed = generate_family_seed(algo);
        let kp = derive_keypair_from_seed(&seed)?;

        let mut disk = self.load_disk();
        let mut rand_id = [0u8; 4];
        OsRng.fill_bytes(&mut rand_id);
        let id = format!("rw-{now_ms}-{}", hex::encode(rand_id));
        let clean_label = if label.trim().is_empty() {
            format!("Rust Vault {}", disk.accounts.len() + 1)
        } else {
            label.trim().to_string()
        };

        let account = WalletAccountPublic {
            id: id.clone(),
            label: clean_label,
            address: kp.classic_address,
            kind: "custodial".to_string(),
            algorithm: Some(algo.as_str().to_string()),
            derivation_path: None,
            created_at: now_ms,
        };

        let one_time_seed = seed.as_str().to_string();
        self.unlocked_seeds.as_mut().unwrap().insert(id, seed);
        disk.accounts.insert(0, account.clone());
        self.persist_unlocked(disk.accounts)?;

        Ok((account, one_time_seed, self.get_status()))
    }

    pub fn import_seed(
        &mut self,
        label: &str,
        seed_input: &str,
        now_ms: u64,
    ) -> Result<(WalletAccountPublic, VaultStatusOut), String> {
        if self.unlocked_seeds.is_none() {
            return Err("Unlock your encrypted vault before importing a seed.".to_string());
        }
        let clean_seed = Zeroizing::new(seed_input.trim().to_string());
        let kp = derive_keypair_from_seed(&clean_seed)?;

        let mut disk = self.load_disk();
        if let Some(existing) = disk.accounts.iter().find(|a| a.address == kp.classic_address && a.kind == "custodial") {
            return Err(format!("Wallet {} is already in your vault.", existing.address));
        }

        let mut rand_id = [0u8; 4];
        OsRng.fill_bytes(&mut rand_id);
        let id = format!("rw-{now_ms}-{}", hex::encode(rand_id));
        let clean_label = if label.trim().is_empty() {
            format!("Imported {}", &kp.classic_address[..6])
        } else {
            label.trim().to_string()
        };

        let account = WalletAccountPublic {
            id: id.clone(),
            label: clean_label,
            address: kp.classic_address.clone(),
            kind: "custodial".to_string(),
            algorithm: Some(kp.algorithm.as_str().to_string()),
            derivation_path: None,
            created_at: now_ms,
        };

        disk.accounts.retain(|a| a.address != kp.classic_address);
        self.unlocked_seeds.as_mut().unwrap().insert(id, clean_seed);
        disk.accounts.insert(0, account.clone());
        self.persist_unlocked(disk.accounts)?;

        Ok((account, self.get_status()))
    }

    pub fn add_watch_account(
        &mut self,
        label: &str,
        address: &str,
        is_hardware: bool,
        derivation_path: Option<String>,
        now_ms: u64,
    ) -> Result<(WalletAccountPublic, VaultStatusOut), String> {
        let addr = address.trim().to_string();
        if !addr.starts_with('r') || addr.len() < 25 || addr.len() > 35 {
            return Err("Invalid XRPL classic r-address.".to_string());
        }
        let mut disk = self.load_disk();
        if disk.accounts.iter().any(|a| a.address == addr) {
            return Err("This address is already tracked in your wallet list.".to_string());
        }

        let mut rand_id = [0u8; 4];
        OsRng.fill_bytes(&mut rand_id);
        let prefix = if is_hardware { "ledger" } else { "watch" };
        let account = WalletAccountPublic {
            id: format!("{prefix}-{now_ms}-{}", hex::encode(rand_id)),
            label: if label.trim().is_empty() {
                format!("Watch {}", &addr[..6])
            } else {
                label.trim().to_string()
            },
            address: addr,
            kind: if is_hardware { "hardware-ledger" } else { "watch-only" }.to_string(),
            algorithm: None,
            derivation_path,
            created_at: now_ms,
        };

        disk.accounts.insert(0, account.clone());
        self.save_disk(&disk)?;
        Ok((account, self.get_status()))
    }

    pub fn remove_account(&mut self, wallet_id: &str) -> Result<VaultStatusOut, String> {
        let mut disk = self.load_disk();
        let was_custodial = disk
            .accounts
            .iter()
            .any(|a| a.id == wallet_id && a.kind == "custodial");
        disk.accounts.retain(|a| a.id != wallet_id);

        if was_custodial && self.unlocked_seeds.is_some() {
            self.unlocked_seeds.as_mut().unwrap().remove(wallet_id);
            self.persist_unlocked(disk.accounts)?;
        } else {
            self.save_disk(&disk)?;
        }
        Ok(self.get_status())
    }

    pub fn get_public_key(&self, wallet_id: &str) -> Result<(String, String), String> {
        let seeds = self.unlocked_seeds.as_ref().ok_or("Vault is locked.")?;
        let seed = seeds.get(wallet_id).ok_or("Wallet key not found in unlocked vault.")?;
        let kp = derive_keypair_from_seed(seed)?;
        Ok((kp.classic_address, kp.public_key_hex))
    }

    pub fn sign_payload(
        &self,
        wallet_id: &str,
        signing_payload_hex: &str,
    ) -> Result<(String, String, String), String> {
        let seeds = self.unlocked_seeds.as_ref().ok_or("Vault is locked.")?;
        let seed = seeds.get(wallet_id).ok_or("Wallet key not found in unlocked vault.")?;
        let kp = derive_keypair_from_seed(seed)?;
        let (pub_hex, sig_hex) = sign_canonical_payload(seed, signing_payload_hex)?;
        Ok((kp.classic_address, pub_hex, sig_hex))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypts_unlocks_signs_and_rejects_bad_passphrase() {
        let tmp = std::env::temp_dir().join(format!("xrpl-rust-vault-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let mut eng = RustVaultEngine::new(tmp.clone());

        assert!(eng.setup_vault("short").is_err());
        let st = eng.setup_vault("super-secret-passphrase-123").expect("setup");
        assert!(st.initialized && st.unlocked);

        let (acct, seed, _) = eng.create_wallet("Primary", "ed25519", 1000).expect("create");
        assert!(acct.address.starts_with('r'));
        assert!(seed.starts_with("sEd"));

        let disk_raw = fs::read_to_string(tmp.join(VAULT_FILENAME)).expect("disk file");
        assert!(!disk_raw.contains(&seed));

        let (_, pub_hex, sig_hex) = eng.sign_payload(&acct.id, "5354580011223344").expect("sign");
        assert!(pub_hex.starts_with("ED"));
        assert_eq!(sig_hex.len(), 128);

        eng.lock();
        assert!(!eng.get_status().unlocked);

        let mut eng2 = RustVaultEngine::new(tmp.clone());
        assert!(eng2.unlock("wrong-passphrase").is_err());
        let unlocked = eng2.unlock("super-secret-passphrase-123").expect("unlock");
        assert_eq!(unlocked.accounts.len(), 1);
        assert_eq!(unlocked.accounts[0].address, acct.address);

        let _ = fs::remove_dir_all(&tmp);
    }
}
