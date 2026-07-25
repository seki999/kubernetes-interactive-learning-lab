import type { StateStorage } from 'zustand/middleware'

// 基于原生 IndexedDB 实现的 zustand persist 存储适配器。
//
// 为什么不用 localStorage：
// 整个虚拟集群状态（所有资源 + Events）可能会比较大，
// localStorage 单个域名通常只有 5MB 左右配额，且是同步 API 会阻塞主线程；
// IndexedDB 容量大得多、是异步 API，更适合保存"完整集群状态"（见需求文档第二节）。
// 用户设置和学习进度这类小数据仍然使用 localStorage（见 useThemeStore 等）。
//
// 这里只用 IndexedDB 存一张 key-value 表，key 就是 zustand persist 传入的
// storage name（例如 "k8s-lab-cluster"），value 是整个 store 的 JSON 字符串，
// 不需要为每个资源单独建表，实现上更简单，也足够满足"刷新页面恢复状态"的需求。

const DB_NAME = 'k8s-lab-db'
const DB_VERSION = 1
const OBJECT_STORE_NAME = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
        db.createObjectStore(OBJECT_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OBJECT_STORE_NAME, mode)
    const request = action(tx.objectStore(OBJECT_STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** 符合 zustand persist 要求的 StateStorage 接口，可直接传给 createJSONStorage。 */
export const indexedDbStorage: StateStorage = {
  async getItem(name) {
    if (typeof indexedDB === 'undefined') {
      return null
    }
    const value = await runTransaction('readonly', (store) => store.get(name))
    return (value as string | undefined) ?? null
  },
  async setItem(name, value) {
    if (typeof indexedDB === 'undefined') {
      return
    }
    await runTransaction('readwrite', (store) => store.put(value, name))
  },
  async removeItem(name) {
    if (typeof indexedDB === 'undefined') {
      return
    }
    await runTransaction('readwrite', (store) => store.delete(name))
  },
}
