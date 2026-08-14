/**
 * Cache for layout manipulations
 */
class LayoutCache {
  constructor(maxSize = 20) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key) {
    const item = this.cache.get(key);
    if (item) {
      item.accessCount++;
      item.lastAccessed = new Date().getTime();
      return item.layout;
    }
    return null;
  }

  set(key, layout, metadata = {}) {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.getOldestKey();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    this.cache.set(key, {
      layout: deepClone(layout),
      metadata,
      accessCount: 1,
      lastAccessed: new Date().getTime(),
      createdAt: new Date().getTime()
    });
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  getOldestKey() {
    if (this.cache.size === 0) return null;
    
    let oldestKey = null;
    let oldestTime = Infinity;
    
    for (const [key, item] of this.cache) {
      if (item.createdAt < oldestTime) {
        oldestTime = item.createdAt;
        oldestKey = key;
      }
    }
    
    return oldestKey;
  }
}

module.exports = {
  LayoutCache
};