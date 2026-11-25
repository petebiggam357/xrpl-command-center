use bs58::Alphabet;
use ed25519_dalek::{Signer as EdSigner, SigningKey as EdSigningKey};
use k256::ecdsa::{signature::hazmat::PrehashSigner, Signature as SecpSignature, SigningKey as SecpSigningKey};
use k256::{NonZeroScalar, ProjectivePoint, Scalar};
use rand_core::{OsRng, RngCore};
use ripemd::Ripemd160;
use sha2::{Digest, Sha256, Sha512};
use zeroize::{Zeroize, Zeroizing};

const ED25519_SEED_PREFIX: [u8; 3] = [0x01, 0xE1, 0x4B];
const SECP256K1_SEED_PREFIX: [u8; 1] = [0x21];
const CLASSIC_ADDRESS_PREFIX: [u8; 1] = [0x00];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyAlgorithm {
    Ed25519,
    Secp256k1,
}

impl KeyAlgorithm {
    pub fn as_str(&self) -> &'static str {
        match self {
            KeyAlgorithm::Ed25519 => "ed25519",
            KeyAlgorithm::Secp256k1 => "ecdsa-secp256k1",
        }
    }
}

pub struct DerivedKeypair {
    pub algorithm: KeyAlgorithm,
    pub public_key_hex: String,
    pub classic_address: String,
    pub private_key_bytes: Zeroizing<[u8; 32]>,
}

fn sha512_half(data: &[u8]) -> [u8; 32] {
    let hash = Sha512::digest(data);
    let mut out = [0u8; 32];
    out.copy_from_slice(&hash[..32]);
    out
}

fn account_id_from_pubkey(pubkey_33: &[u8]) -> [u8; 20] {
    let sha = Sha256::digest(pubkey_33);
    let ripe = Ripemd160::digest(sha);
    let mut out = [0u8; 20];
    out.copy_from_slice(&ripe);
    out
}

pub fn encode_classic_address(account_id: &[u8; 20]) -> String {
    let mut payload = Vec::with_capacity(21);
    payload.extend_from_slice(&CLASSIC_ADDRESS_PREFIX);
    payload.extend_from_slice(account_id);
    bs58::encode(payload)
        .with_alphabet(Alphabet::RIPPLE)
        .with_check()
        .into_string()
}

pub fn generate_family_seed(algorithm: KeyAlgorithm) -> Zeroizing<String> {
    let mut entropy = Zeroizing::new([0u8; 16]);
    OsRng.fill_bytes(&mut *entropy);
    encode_family_seed(&entropy, algorithm)
}

fn encode_family_seed(entropy: &[u8; 16], algorithm: KeyAlgorithm) -> Zeroizing<String> {
    let mut raw = Zeroizing::new(Vec::with_capacity(20));
    match algorithm {
        KeyAlgorithm::Ed25519 => raw.extend_from_slice(&ED25519_SEED_PREFIX),
        KeyAlgorithm::Secp256k1 => raw.extend_from_slice(&SECP256K1_SEED_PREFIX),
    }
    raw.extend_from_slice(entropy);
    let encoded = bs58::encode(&*raw)
        .with_alphabet(Alphabet::RIPPLE)
        .with_check()
        .into_string();
    Zeroizing::new(encoded)
}

pub fn decode_family_seed(seed: &str) -> Result<(Zeroizing<[u8; 16]>, KeyAlgorithm), String> {
    let decoded = Zeroizing::new(
        bs58::decode(seed.trim())
            .with_alphabet(Alphabet::RIPPLE)
            .with_check(None)
            .into_vec()
            .map_err(|_| "Invalid XRPL Base58Check family seed".to_string())?,
    );

    if decoded.len() == 19 && decoded[0..3] == ED25519_SEED_PREFIX {
        let mut entropy = Zeroizing::new([0u8; 16]);
        entropy.copy_from_slice(&decoded[3..19]);
        return Ok((entropy, KeyAlgorithm::Ed25519));
    }
    if decoded.len() == 17 && decoded[0..1] == SECP256K1_SEED_PREFIX {
        let mut entropy = Zeroizing::new([0u8; 16]);
        entropy.copy_from_slice(&decoded[1..17]);
        return Ok((entropy, KeyAlgorithm::Secp256k1));
    }

    Err("Unsupported XRPL seed prefix or length (expected sEd... or s...)".to_string())
}

fn derive_secp_scalar(seed_bytes: &[u8], discriminator: Option<u32>) -> Result<NonZeroScalar, String> {
    for seq in 0u32..1024 {
        let mut buf = Zeroizing::new(Vec::with_capacity(seed_bytes.len() + 8));
        buf.extend_from_slice(seed_bytes);
        if let Some(disc) = discriminator {
            buf.extend_from_slice(&disc.to_be_bytes());
        }
        buf.extend_from_slice(&seq.to_be_bytes());
        let mut candidate = sha512_half(&buf);
        let opt = NonZeroScalar::try_from(&candidate[..]);
        candidate.zeroize();
        if let Ok(nz) = opt {
            return Ok(nz);
        }
    }
    Err("Failed to derive valid secp256k1 scalar".to_string())
}

pub fn derive_keypair_from_seed(seed: &str) -> Result<DerivedKeypair, String> {
    let (entropy, algorithm) = decode_family_seed(seed)?;

    match algorithm {
        KeyAlgorithm::Ed25519 => {
            let priv_bytes = Zeroizing::new(sha512_half(&*entropy));
            let signing_key = EdSigningKey::from_bytes(&*priv_bytes);
            let verifying_key = signing_key.verifying_key();

            let mut pubkey_33 = [0u8; 33];
            pubkey_33[0] = 0xED;
            pubkey_33[1..33].copy_from_slice(verifying_key.as_bytes());

            let acct_id = account_id_from_pubkey(&pubkey_33);
            let classic_address = encode_classic_address(&acct_id);

            Ok(DerivedKeypair {
                algorithm,
                public_key_hex: hex::encode_upper(pubkey_33),
                classic_address,
                private_key_bytes: priv_bytes,
            })
        }
        KeyAlgorithm::Secp256k1 => {
            // Standard XRPL secp256k1 family seed -> root key -> account key index 0
            let root_priv = derive_secp_scalar(&*entropy, None)?;
            let root_pub_point = ProjectivePoint::GENERATOR * *root_priv.as_ref();
            let root_pub_affine = root_pub_point.to_affine();
            let root_pub_bytes = k256::EncodedPoint::from(root_pub_affine);
            let root_pub_compressed = root_pub_bytes.compress();

            let offset = derive_secp_scalar(root_pub_compressed.as_bytes(), Some(0u32))?;
            let acct_scalar: Scalar = *root_priv.as_ref() + *offset.as_ref();
            let acct_nz = NonZeroScalar::new(acct_scalar)
                .into_option()
                .ok_or_else(|| "Derived zero secp256k1 account scalar".to_string())?;

            let mut priv_bytes = Zeroizing::new([0u8; 32]);
            priv_bytes.copy_from_slice(&acct_nz.to_bytes());

            let acct_pub_point = ProjectivePoint::GENERATOR * *acct_nz.as_ref();
            let acct_pub_compressed = k256::EncodedPoint::from(acct_pub_point.to_affine()).compress();
            let pubkey_slice = acct_pub_compressed.as_bytes();
            let acct_id = account_id_from_pubkey(pubkey_slice);
            let classic_address = encode_classic_address(&acct_id);

            Ok(DerivedKeypair {
                algorithm,
                public_key_hex: hex::encode_upper(pubkey_slice),
                classic_address,
                private_key_bytes: priv_bytes,
            })
        }
    }
}

pub fn sign_canonical_payload(seed: &str, signing_payload_hex: &str) -> Result<(String, String), String> {
    let kp = derive_keypair_from_seed(seed)?;
    let payload_bytes = hex::decode(signing_payload_hex.trim())
        .map_err(|_| "Invalid hexadecimal signing payload".to_string())?;

    match kp.algorithm {
        KeyAlgorithm::Ed25519 => {
            let signing_key = EdSigningKey::from_bytes(&*kp.private_key_bytes);
            let sig = signing_key.sign(&payload_bytes);
            Ok((kp.public_key_hex, hex::encode_upper(sig.to_bytes())))
        }
        KeyAlgorithm::Secp256k1 => {
            let signing_key = SecpSigningKey::from_slice(&*kp.private_key_bytes)
                .map_err(|_| "Failed to initialize secp256k1 signing key".to_string())?;
            let digest = sha512_half(&payload_bytes);
            let raw_sig: SecpSignature = signing_key
                .sign_prehash(&digest)
                .map_err(|_| "secp256k1 ECDSA signing failed".to_string())?;
            // XRPL requires canonical low-S DER-encoded ECDSA signatures
            let normalized = raw_sig.normalize_s().unwrap_or(raw_sig);
            let der = normalized.to_der();
            Ok((kp.public_key_hex, hex::encode_upper(der.as_bytes())))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_and_derives_ed25519_and_secp256k1() {
        let ed_seed = generate_family_seed(KeyAlgorithm::Ed25519);
        assert!(ed_seed.starts_with("sEd"));
        let ed_kp = derive_keypair_from_seed(&ed_seed).expect("ed derive");
        assert!(ed_kp.classic_address.starts_with('r'));
        assert!(ed_kp.public_key_hex.starts_with("ED"));

        let secp_seed = generate_family_seed(KeyAlgorithm::Secp256k1);
        assert!(secp_seed.starts_with('s'));
        let secp_kp = derive_keypair_from_seed(&secp_seed).expect("secp derive");
        assert!(secp_kp.classic_address.starts_with('r'));
        assert_eq!(secp_kp.public_key_hex.len(), 66);

        let (pub_hex, sig_hex) = sign_canonical_payload(&ed_seed, "53545800AABBCCDD").expect("sign ed");
        assert_eq!(pub_hex, ed_kp.public_key_hex);
        assert_eq!(sig_hex.len(), 128);

        let (secp_pub, secp_sig) = sign_canonical_payload(&secp_seed, "53545800AABBCCDD").expect("sign secp");
        assert_eq!(secp_pub, secp_kp.public_key_hex);
        assert!(secp_sig.starts_with("30")); // DER SEQUENCE header
    }
}
