import { desktopBridge, platform } from './runtime';

/**
 * Small secrets kept on this device: staff sessions and PIN hashes. Values are text (JSON).
 *   - Windows: Windows' own encryption (DPAPI), through the Electron main process.
 *   - Android (and later iOS): the Android Keystore / iOS Keychain.
 *   - Browser: AES-GCM with a key the browser won't let anyone export, kept in IndexedDB. Weaker
 *     than the other two: someone with access to the browser profile can still use the key.
 */
export interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

// Browser ----------------------------------------------------------------------------------------

const DB_NAME = 'gym-secure';
const KEY_STORE = 'keys';
const ITEM_STORE = 'items';
const KEY_ID = 'aes-gcm';

interface EncryptedItem {
  readonly iv: Uint8Array<ArrayBuffer>;
  readonly data: ArrayBuffer;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB request failed'));
    };
  });
}

function openBrowserDatabase(): Promise<IDBDatabase> {
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => {
    open.result.createObjectStore(KEY_STORE);
    open.result.createObjectStore(ITEM_STORE);
  };
  return request(open);
}

function isEncryptedItem(value: unknown): value is EncryptedItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'iv' in value &&
    value.iv instanceof Uint8Array &&
    'data' in value &&
    value.data instanceof ArrayBuffer
  );
}

function createBrowserStorage(): SecureStorage {
  let database: Promise<IDBDatabase> | undefined;
  let cryptoKey: Promise<CryptoKey> | undefined;
  const db = () => (database ??= openBrowserDatabase());

  async function loadKey(): Promise<CryptoKey> {
    const read = (await db()).transaction(KEY_STORE).objectStore(KEY_STORE);
    const existing: unknown = await request(read.get(KEY_ID));
    if (existing instanceof CryptoKey) return existing;
    // Not extractable: page code can use the key but never read it out.
    const created = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const write = (await db()).transaction(KEY_STORE, 'readwrite').objectStore(KEY_STORE);
    // add() fails if another tab created a key first; that one is used then.
    try {
      await request(write.add(created, KEY_ID));
      return created;
    } catch {
      const winner: unknown = await request(
        (await db()).transaction(KEY_STORE).objectStore(KEY_STORE).get(KEY_ID),
      );
      if (winner instanceof CryptoKey) return winner;
      throw new Error('Could not create the secure storage key');
    }
  }
  const key = () => (cryptoKey ??= loadKey());

  return {
    async get(name) {
      const items = (await db()).transaction(ITEM_STORE).objectStore(ITEM_STORE);
      const item: unknown = await request(items.get(name));
      if (!isEncryptedItem(item)) return null;
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: item.iv },
        await key(),
        item.data,
      );
      return new TextDecoder().decode(plain);
    },
    async set(name, value) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        await key(),
        new TextEncoder().encode(value),
      );
      const items = (await db()).transaction(ITEM_STORE, 'readwrite').objectStore(ITEM_STORE);
      await request(items.put({ iv, data } satisfies EncryptedItem, name));
    },
    async delete(name) {
      const items = (await db()).transaction(ITEM_STORE, 'readwrite').objectStore(ITEM_STORE);
      await request(items.delete(name));
    },
  };
}

// Android and iOS ----------------------------------------------------------------------------------

function createNativeStorage(): SecureStorage {
  // Wrapped in an object: a Capacitor plugin is a proxy, and resolving a promise with it makes the
  // promise call plugin.then(), which Capacitor treats as a (missing) native method.
  const loaded = import('@aparajita/capacitor-secure-storage').then(async ({ SecureStorage }) => {
    await SecureStorage.setKeyPrefix('gym.');
    return { plugin: SecureStorage };
  });
  return {
    get: async (key) => (await loaded).plugin.getItem(key),
    set: async (key, value) => {
      await (await loaded).plugin.setItem(key, value);
    },
    delete: async (key) => {
      await (await loaded).plugin.removeItem(key);
    },
  };
}

// ------------------------------------------------------------------------------------------------

function createSecureStorage(): SecureStorage {
  if (desktopBridge) {
    const bridge = desktopBridge;
    return {
      get: (key) => bridge.secureGet(key),
      set: (key, value) => bridge.secureSet(key, value),
      delete: (key) => bridge.secureDelete(key),
    };
  }
  if (platform === 'android' || platform === 'ios') return createNativeStorage();
  return createBrowserStorage();
}

let instance: SecureStorage | undefined;

/** This device's secure storage (created on first use). */
export function secureStorage(): SecureStorage {
  return (instance ??= createSecureStorage());
}
