//! Verify a Policy Replay proof.json with zkVerify's own risc0-verifier crate (the code the
//! zkVerify chain runs), before spending a testnet submission on it.
//! usage: zkv-check runs/01/proof.json [2.3|3.0]
use risc0_verifier::{v2_3, v3_0, Journal, Proof, Verifier, Vk};

fn unhex(s: &str) -> Vec<u8> {
    hex::decode(s.trim_start_matches("0x")).expect("hex")
}

fn main() {
    let path = std::env::args().nth(1).expect("usage: zkv-check <proof.json>");
    let j: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    let proof: Proof = ciborium::from_reader(unhex(j["proof"].as_str().unwrap()).as_slice()).expect("proof does not deserialize");
    let journal = Journal::new(unhex(j["pub_inputs"].as_str().unwrap()));
    let vkb: [u8; 32] = unhex(j["image_id"].as_str().unwrap()).try_into().unwrap();
    let vk: Vk = vkb.into();
    let ver = std::env::args().nth(2).unwrap_or_else(|| "2.3".into());
    let r = if ver == "3.0" { v3_0().verify(vk.into(), proof, journal) } else { v2_3().verify(vk.into(), proof, journal) };
    match r {
        Ok(_) => println!("{path}: OK (zkVerify risc0-verifier, context v{ver})"),
        Err(e) => { println!("{path}: FAILED {e:?}"); std::process::exit(1) }
    }
}
