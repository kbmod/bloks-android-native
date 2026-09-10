import * as Keychain from "react-native-keychain";

import {
  KeychainSecureConnectionStorage,
  type KeychainSecureConnectionStorageOptions,
} from "./secure-connection-storage";

/** Create the production Android Keystore-backed connection store. */
export function createSecureConnectionStorage(): KeychainSecureConnectionStorage {
  const options: KeychainSecureConnectionStorageOptions = {
    // This is the minimum accepted protection level; Android may select
    // secure hardware when it is available, but never falls back to ANY.
    securityLevel: Keychain.SECURITY_LEVEL.SECURE_SOFTWARE,
  };
  return new KeychainSecureConnectionStorage(Keychain, options);
}
