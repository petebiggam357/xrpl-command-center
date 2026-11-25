mod vault;
mod xrpl_crypto;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use vault::RustVaultEngine;

#[derive(Deserialize)]
struct RpcRequest {
    id: u64,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Serialize)]
struct RpcResponse {
    id: u64,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn parse_vault_dir() -> PathBuf {
    let args: Vec<String> = std::env::args().collect();
    for i in 0..args.len() {
        if args[i] == "--vault-dir" && i + 1 < args.len() {
            return PathBuf::from(&args[i + 1]);
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn handle_request(engine: &mut RustVaultEngine, req: RpcRequest) -> RpcResponse {
    let res: Result<Value, String> = match req.method.as_str() {
        "ping" => Ok(json!({ "pong": true, "pid": std::process::id(), "version": "0.0.3-alpha" })),
        "status" => Ok(serde_json::to_value(engine.get_status()).unwrap()),
        "setup" => {
            let pass = req.params["passphrase"].as_str().unwrap_or("");
            engine
                .setup_vault(pass)
                .map(|st| serde_json::to_value(st).unwrap())
        }
        "unlock" => {
            let pass = req.params["passphrase"].as_str().unwrap_or("");
            engine
                .unlock(pass)
                .map(|st| serde_json::to_value(st).unwrap())
        }
        "lock" => Ok(serde_json::to_value(engine.lock()).unwrap()),
        "create" => {
            let label = req.params["label"].as_str().unwrap_or("");
            let algo = req.params["algorithm"].as_str().unwrap_or("ed25519");
            engine
                .create_wallet(label, algo, now_unix_ms())
                .map(|(account, one_time_seed, status)| {
                    json!({
                        "account": account,
                        "oneTimeSeed": one_time_seed,
                        "status": status
                    })
                })
        }
        "import" => {
            let label = req.params["label"].as_str().unwrap_or("");
            let seed = req.params["seed"].as_str().unwrap_or("");
            engine
                .import_seed(label, seed, now_unix_ms())
                .map(|(account, status)| json!({ "account": account, "status": status }))
        }
        "addWatch" => {
            let label = req.params["label"].as_str().unwrap_or("");
            let address = req.params["address"].as_str().unwrap_or("");
            let is_hw = req.params["isHardwareLedger"].as_bool().unwrap_or(false);
            let path = req.params["derivationPath"].as_str().map(|s| s.to_string());
            engine
                .add_watch_account(label, address, is_hw, path, now_unix_ms())
                .map(|(account, status)| json!({ "account": account, "status": status }))
        }
        "remove" => {
            let id = req.params["walletId"].as_str().unwrap_or("");
            engine
                .remove_account(id)
                .map(|st| serde_json::to_value(st).unwrap())
        }
        "getPublicKey" => {
            let id = req.params["walletId"].as_str().unwrap_or("");
            engine.get_public_key(id).map(|(address, public_key_hex)| {
                json!({ "address": address, "publicKeyHex": public_key_hex })
            })
        }
        "signPayload" => {
            let id = req.params["walletId"].as_str().unwrap_or("");
            let payload_hex = req.params["signingPayloadHex"].as_str().unwrap_or("");
            engine
                .sign_payload(id, payload_hex)
                .map(|(address, public_key_hex, signature_hex)| {
                    json!({
                        "address": address,
                        "publicKeyHex": public_key_hex,
                        "signatureHex": signature_hex
                    })
                })
        }
        other => Err(format!("Unknown vault RPC method: {other}")),
    };

    match res {
        Ok(val) => RpcResponse {
            id: req.id,
            ok: true,
            result: Some(val),
            error: None,
        },
        Err(err) => RpcResponse {
            id: req.id,
            ok: false,
            result: None,
            error: Some(err),
        },
    }
}

fn main() {
    let vault_dir = parse_vault_dir();
    let mut engine = RustVaultEngine::new(vault_dir);

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line_res in stdin.lock().lines() {
        let Ok(line) = line_res else { break };
        if line.trim().is_empty() {
            continue;
        }
        let resp = match serde_json::from_str::<RpcRequest>(&line) {
            Ok(req) => handle_request(&mut engine, req),
            Err(e) => RpcResponse {
                id: 0,
                ok: false,
                result: None,
                error: Some(format!("Malformed JSON-RPC request: {e}")),
            },
        };
        if let Ok(out) = serde_json::to_string(&resp) {
            let _ = writeln!(stdout, "{out}");
            let _ = stdout.flush();
        }
    }

    engine.lock();
}
