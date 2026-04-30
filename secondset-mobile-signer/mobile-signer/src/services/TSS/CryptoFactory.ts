// mobile-signer/src/services/TSS/CryptoFactory.ts
//
// Factory for selecting the correct DKG, signing, and recovery implementation based on curve type

import { TSSKeygen, TSSSigning } from './TSSCrypto';
import { Ed25519Keygen, Ed25519Signing } from './Ed25519Crypto';
import {
  OldSignerReshareSecp256k1,
  NewSignerReshareSecp256k1,
  OldSignerReshareEd25519,
  NewSignerReshareEd25519,
  generateDeviceKeyPair,
} from './RecoveryCrypto';

export type CurveType = 'secp256k1' | 'ed25519';

export function getKeygen(curveType: CurveType): typeof TSSKeygen | typeof Ed25519Keygen {
  return curveType === 'ed25519' ? Ed25519Keygen : TSSKeygen;
}

export function getSigning(curveType: CurveType): typeof TSSSigning | typeof Ed25519Signing {
  return curveType === 'ed25519' ? Ed25519Signing : TSSSigning;
}

export function getOldSignerReshare(curveType: CurveType) {
  return curveType === 'ed25519' ? OldSignerReshareEd25519 : OldSignerReshareSecp256k1;
}

export function getNewSignerReshare(curveType: CurveType) {
  return curveType === 'ed25519' ? NewSignerReshareEd25519 : NewSignerReshareSecp256k1;
}

export { generateDeviceKeyPair };
