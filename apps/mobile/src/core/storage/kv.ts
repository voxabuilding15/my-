import { Storage } from 'expo-sqlite/kv-store';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

const sqliteStateStorage: StateStorage = {
  getItem: (name) => Storage.getItemSync(name),
  setItem: (name, value) => Storage.setItemSync(name, value),
  removeItem: (name) => {
    Storage.removeItemSync(name);
  },
};

/** Non-sensitive persisted state only. Tokens and secrets belong in expo-secure-store. */
export const persistentStorage = createJSONStorage(() => sqliteStateStorage);
