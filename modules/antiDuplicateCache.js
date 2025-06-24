const fs = require('fs');
const path = require('path');

class AntiDuplicateCache {
  constructor() {
    this.cachePath = path.join(__dirname, '../data/duplicateCache.json');
    this.userActions = new Map();
    this.loadFromDisk();
    
    // Limpiar entradas antiguas cada 2 minutos
    setInterval(() => this.cleanup(), 2 * 60 * 1000);
  }
  
  loadFromDisk() {
    try {
      if (fs.existsSync(this.cachePath)) {
        const data = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
        
        if (data && data.entries) {
          for (const [key, entry] of Object.entries(data.entries)) {
            // Solo mantener entradas más recientes que 30 segundos
            if (Date.now() - entry.timestamp < 30000) {
              this.userActions.set(key, entry);
            }
          }
        }
        console.log(`[AntiDuplicate] Cargadas ${this.userActions.size} entradas del caché`);
      }
    } catch (err) {
      console.error('[AntiDuplicate] Error al cargar caché:', err);
      this.userActions = new Map();
    }
  }
  
  saveToDisk() {
    try {
      const entries = {};
      this.userActions.forEach((value, key) => {
        entries[key] = value;
      });
      
      const data = {
        entries,
        lastSaved: Date.now()
      };
      
      // Crear directorio si no existe
      const dir = path.dirname(this.cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.cachePath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[AntiDuplicate] Error al guardar caché:', err);
    }
  }
  
  checkAndLock(userId, action, timeWindow = 3000) {
    // Crear una clave única basada en la acción y el usuario
    const key = `${userId}-${action}`;
    
    const now = Date.now();
    const existing = this.userActions.get(key);
    
    // Si existe una acción reciente y no ha pasado el tiempo mínimo
    if (existing && (now - existing.timestamp < timeWindow)) {
      console.log(`[AntiDuplicate] Bloqueada acción duplicada: ${action} para usuario ${userId}`);
      
      // Actualizar timestamp para extender el bloqueo
      existing.timestamp = now;
      existing.attempts = (existing.attempts || 1) + 1;
      this.userActions.set(key, existing);
      
      // Guardar inmediatamente para persistencia
      if (existing.attempts % 3 === 0) {  // Guardar cada 3 intentos para no sobrecargar el disco
        this.saveToDisk();
      }
      
      return {
        allowed: false,
        reason: 'duplicate_action',
        message: 'Esta acción ya está en proceso. Por favor espera unos segundos.',
        timeLeft: Math.ceil((existing.timestamp + timeWindow - now) / 1000)
      };
    }
    
    // Si no existe o ha pasado suficiente tiempo, registrar la acción
    this.userActions.set(key, {
      timestamp: now,
      action,
      userId,
      attempts: 1
    });
    
    // Guardar en disco para mantener persistencia
    this.saveToDisk();
    
    return {
      allowed: true
    };
  }
  
  // Liberar un bloqueo explícitamente
  release(userId, action) {
    const key = `${userId}-${action}`;
    const result = this.userActions.delete(key);
    this.saveToDisk();
    return result;
  }
  
  // Limpiar entradas antiguas
  cleanup() {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.userActions.entries()) {
      // Eliminar entradas más antiguas que 2 minutos
      if (now - entry.timestamp > 2 * 60 * 1000) {
        this.userActions.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.log(`[AntiDuplicate] Limpieza: ${removed} entradas eliminadas`);
      this.saveToDisk();
    }
  }
}

// Exportar una instancia única
module.exports = new AntiDuplicateCache();