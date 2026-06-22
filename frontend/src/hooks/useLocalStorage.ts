import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';

function metaKey(key: string): string {
  return `${key}:__meta`;
}

interface StorageMeta {
  updatedAt: number;
}

function readMeta(key: string): StorageMeta | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(metaKey(key));
    return raw ? (JSON.parse(raw) as StorageMeta) : null;
  } catch (error) {
    logger.warn(`Error reading localStorage meta for key "${key}":`, error);
    return null;
  }
}

export interface LocalStorageCacheInfo {
  /** True once `ttlMs` has elapsed since the value was last written. Always false when `ttlMs` is not provided. */
  isStale: boolean;
  /** Timestamp (ms) the value was last written, or null if it has never been written by this hook. */
  lastUpdated: number | null;
  /** Clears the staleness metadata without touching the stored value, forcing `isStale` to report stale on next read. */
  invalidate: () => void;
}

export interface UseLocalStorageOptions {
  /** If set, `isStale` becomes true once this many milliseconds have elapsed since the last write. */
  ttlMs?: number;
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options?: UseLocalStorageOptions
): [T, (value: T | ((val: T) => T)) => void, () => void, LocalStorageCacheInfo] {
  // Get from local storage then parse stored json or return initialValue
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      logger.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const [lastUpdated, setLastUpdated] = useState<number | null>(() => readMeta(key)?.updatedAt ?? null);

  const writeMeta = useCallback((updatedAt: number | null) => {
    if (typeof window === 'undefined') {
      setLastUpdated(updatedAt);
      return;
    }

    if (updatedAt === null) {
      window.localStorage.removeItem(metaKey(key));
    } else {
      window.localStorage.setItem(metaKey(key), JSON.stringify({ updatedAt }));
    }

    setLastUpdated(updatedAt);
  }, [key]);

  // Return a wrapped version of useState's setter function that persists the new value to localStorage
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      setStoredValue(prevValue => {
        // Allow value to be a function so we have the same API as useState
        const valueToStore = value instanceof Function ? value(prevValue) : value;

        // Save to local storage
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }

        return valueToStore;
      });
      writeMeta(Date.now());
    } catch (error) {
      logger.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, writeMeta]);

  // Remove from localStorage
  const removeValue = useCallback(() => {
    try {
      setStoredValue(initialValue);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
      writeMeta(null);
    } catch (error) {
      logger.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue, writeMeta]);

  /** Marks the cached value stale without removing it, so callers can show stale data while refetching. */
  const invalidate = useCallback(() => {
    writeMeta(null);
  }, [writeMeta]);

  // Listen for changes to this key from other tabs/windows
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue));
        } catch (error) {
          logger.warn(`Error parsing localStorage change for key "${key}":`, error);
        }
      }

      if (e.key === metaKey(key)) {
        setLastUpdated(e.newValue ? (JSON.parse(e.newValue) as StorageMeta).updatedAt : null);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  const ttlMs = options?.ttlMs;
  const isStale = ttlMs != null && (lastUpdated == null || Date.now() - lastUpdated > ttlMs);

  return [storedValue, setValue, removeValue, { isStale, lastUpdated, invalidate }];
}
