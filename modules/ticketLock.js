// Sistema de bloqueo centralizado para tickets
const fs = require('fs');
const pathModule = require('path');

class TicketLockSystem {
  constructor() {
    this.lockPath = pathModule.join(__dirname, '../data/ticketLocks.json');
    this.activeLocks = new Map();
    
    // Cargar bloqueos existentes
    this.loadLocks();
    
    // Limpiar periódicamente bloqueos antiguos
    setInterval(() => this.cleanupExpiredLocks(), 60000); // cada minuto
  }
  
  loadLocks() {
    try {
      if (fs.existsSync(this.lockPath)) {
        const data = JSON.parse(fs.readFileSync(this.lockPath, 'utf8'));
        
        if (data && Array.isArray(data.locks)) {
          const now = Date.now();
          
          for (const lock of data.locks) {
            if (lock.userId && lock.expires > now) {
              this.activeLocks.set(lock.userId, lock.expires);
            }
          }
        }
        
        console.log(`[TicketLock] Cargados ${this.activeLocks.size} bloqueos activos`);
      }
    } catch (err) {
      console.error('[TicketLock] Error al cargar bloqueos:', err);
    }
  }
  
  saveLocks() {
    try {
      const locks = [];
      const now = Date.now();
      
      for (const [userId, expires] of this.activeLocks.entries()) {
        if (expires > now) {
          locks.push({ userId, expires });
        }
      }
      
      // Crear directorio si no existe
      const dir = pathModule.dirname(this.lockPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.lockPath, JSON.stringify({
        locks,
        savedAt: Date.now()
      }, null, 2));
    } catch (err) {
      console.error('[TicketLock] Error al guardar bloqueos:', err);
    }
  }
  
  // Comprobar si un usuario tiene un bloqueo
  isLocked(userId) {
    const lockExpiry = this.activeLocks.get(userId);
    const now = Date.now();
    
    if (!lockExpiry) return false;
    
    if (now >= lockExpiry) {
      this.activeLocks.delete(userId);
      return false;
    }
    
    return true;
  }
  
  // Crear un bloqueo para un usuario
  createLock(userId, durationSeconds = 15) {
    const expiryTime = Date.now() + (durationSeconds * 1000);
    this.activeLocks.set(userId, expiryTime);
    this.saveLocks();
    
    console.log(`[TicketLock] Bloqueando creación de tickets para ${userId} durante ${durationSeconds} segundos`);
    return true;
  }
  
  // Eliminar un bloqueo
  releaseLock(userId) {
    if (this.activeLocks.has(userId)) {
      this.activeLocks.delete(userId);
      this.saveLocks();
      console.log(`[TicketLock] Bloqueo liberado para ${userId}`);
      return true;
    }
    return false;
  }
  
  // Obtener tiempo restante de bloqueo
  getLockTimeLeft(userId) {
    if (!this.activeLocks.has(userId)) return 0;
    
    const expiryTime = this.activeLocks.get(userId);
    const now = Date.now();
    
    if (now >= expiryTime) {
      this.activeLocks.delete(userId);
      return 0;
    }
    
    return Math.ceil((expiryTime - now) / 1000);
  }
  
  // Limpiar bloqueos expirados
  cleanupExpiredLocks() {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [userId, expires] of this.activeLocks.entries()) {
      if (expires <= now) {
        this.activeLocks.delete(userId);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`[TicketLock] Eliminados ${removedCount} bloqueos expirados`);
      this.saveLocks();
    }
  }
}

// Exportar una única instancia
module.exports = new TicketLockSystem();
