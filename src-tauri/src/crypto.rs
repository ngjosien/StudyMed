//! Master-password crypto: Argon2id → 256-bit key → AES-256-GCM.
//! The key lives only in Rust memory while unlocked and is zeroed on lock.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

pub const VERIFIER: &[u8] = b"studymed-vault-verifier-v1";
pub const KDF_PARAMS: &str = r#"{"m_cost":19456,"t_cost":2,"p_cost":1}"#;

pub type Key = Zeroizing<[u8; 32]>;

pub fn random_bytes<const N: usize>() -> AppResult<[u8; N]> {
    let mut b = [0u8; N];
    getrandom::getrandom(&mut b).map_err(|e| AppError::msg(format!("rng: {e}")))?;
    Ok(b)
}

pub fn derive_key(password: &str, salt: &[u8], params_json: &str) -> AppResult<Key> {
    let p: serde_json::Value = serde_json::from_str(params_json)?;
    let get = |k: &str, d: u32| p.get(k).and_then(|v| v.as_u64()).map(|v| v as u32).unwrap_or(d);
    let params = Params::new(get("m_cost", 19456), get("t_cost", 2), get("p_cost", 1), Some(32))
        .map_err(|e| AppError::msg(format!("kdf params: {e}")))?;
    let mut key = Zeroizing::new([0u8; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), salt, key.as_mut())
        .map_err(|e| AppError::msg(format!("kdf: {e}")))?;
    Ok(key)
}

/// Returns (ciphertext, nonce).
pub fn encrypt(key: &Key, plaintext: &[u8]) -> AppResult<(Vec<u8>, Vec<u8>)> {
    let cipher = Aes256Gcm::new_from_slice(key.as_ref()).map_err(|_| AppError::msg("bad key"))?;
    let nonce = random_bytes::<12>()?;
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext)
        .map_err(|_| AppError::msg("encryption failed"))?;
    Ok((ct, nonce.to_vec()))
}

pub fn decrypt(key: &Key, ct: &[u8], nonce: &[u8]) -> AppResult<Vec<u8>> {
    if nonce.len() != 12 {
        return Err(AppError::msg("corrupt nonce"));
    }
    let cipher = Aes256Gcm::new_from_slice(key.as_ref()).map_err(|_| AppError::msg("bad key"))?;
    cipher
        .decrypt(Nonce::from_slice(nonce), ct)
        .map_err(|_| AppError::msg("decryption failed"))
}

/// In-memory unlock state with inactivity auto-lock.
pub struct Vault {
    inner: Mutex<Option<(Key, Instant)>>,
}

impl Default for Vault {
    fn default() -> Self {
        Vault { inner: Mutex::new(None) }
    }
}

impl Vault {
    pub fn set(&self, key: Key) {
        if let Ok(mut g) = self.inner.lock() {
            *g = Some((key, Instant::now()));
        }
    }

    pub fn lock(&self) {
        if let Ok(mut g) = self.inner.lock() {
            *g = None; // Zeroizing wipes the key on drop
        }
    }

    /// Status check. Must NOT count as activity: the UI polls this, and refreshing
    /// the timer here would stop auto-lock from ever firing.
    pub fn is_unlocked(&self, auto_lock_min: i64) -> bool {
        let Ok(mut g) = self.inner.lock() else { return false };
        let expired = match g.as_ref() {
            Some((_, last)) => {
                auto_lock_min > 0 && last.elapsed() > Duration::from_secs(auto_lock_min as u64 * 60)
            }
            None => return false,
        };
        if expired {
            *g = None;
        }
        !expired
    }

    #[cfg(test)]
    fn age(&self, by: Duration) {
        if let Some((_, last)) = self.inner.lock().unwrap().as_mut() {
            *last = last.checked_sub(by).expect("machine uptime too short for test");
        }
    }

    /// Current key (refreshing the activity timer), or an error if locked/expired.
    pub fn key(&self, auto_lock_min: i64) -> AppResult<Key> {
        let mut g = self.inner.lock().map_err(|_| AppError::msg("vault state poisoned"))?;
        let expired = match g.as_ref() {
            Some((_, last)) => {
                auto_lock_min > 0 && last.elapsed() > Duration::from_secs(auto_lock_min as u64 * 60)
            }
            None => return Err(AppError::msg("VAULT_LOCKED")),
        };
        if expired {
            *g = None;
            return Err(AppError::msg("VAULT_LOCKED"));
        }
        let (k, last) = g.as_mut().expect("checked above");
        *last = Instant::now();
        Ok(Zeroizing::new(**k))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_and_wrong_key() {
        let salt = random_bytes::<16>().unwrap();
        let fast = r#"{"m_cost":1024,"t_cost":1,"p_cost":1}"#;
        let k = derive_key("hunter2", &salt, fast).unwrap();
        let (ct, n) = encrypt(&k, b"secret").unwrap();
        assert_eq!(decrypt(&k, &ct, &n).unwrap(), b"secret");
        let wrong = derive_key("hunter3", &salt, fast).unwrap();
        assert!(decrypt(&wrong, &ct, &n).is_err());
    }

    #[test]
    fn status_polling_does_not_postpone_auto_lock() {
        let v = Vault::default();
        v.set(Zeroizing::new([7u8; 32]));
        v.age(Duration::from_secs(40));
        assert!(v.is_unlocked(1));
        v.age(Duration::from_secs(25)); // 65 s since real activity, despite the poll
        assert!(!v.is_unlocked(1));
        assert!(v.key(1).is_err());
    }

    #[test]
    fn real_activity_postpones_auto_lock() {
        let v = Vault::default();
        v.set(Zeroizing::new([7u8; 32]));
        v.age(Duration::from_secs(40));
        assert!(v.key(1).is_ok());
        v.age(Duration::from_secs(25));
        assert!(v.is_unlocked(1));
    }

    #[test]
    fn vault_lock_state() {
        let v = Vault::default();
        assert!(!v.is_unlocked(5));
        v.set(Zeroizing::new([7u8; 32]));
        assert!(v.is_unlocked(5));
        v.lock();
        assert!(v.key(5).is_err());
    }
}
