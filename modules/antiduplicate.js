// Sistema anti-duplicados especial para tickets y otras acciones críticas
const fs = require('fs');
const path = require('path');

class AntiDuplicateTicketSystem {
  constructor() {
    this.cachePath = path.join(__dirname, '../data/ticketLocks.json');
    this.locks = new Map();
    this.loadFromDisk();
    
    // Limpiar entradas antiguas cada minuto
    setInterval(() => this.cleanup(), 60000);
  }
  
  loadFromDisk() {
    try {
      if (fs.existsSync(this.cachePath)) {
        const data = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
        
        if (data && Array.isArray(data.locks)) {
          for (const lock of data.locks) {
            if (lock.userId && lock.action && lock.expires > Date.now()) {
              this.locks.set(`${lock.userId}-${lock.action}`, lock.expires);
            }
          }
        }
        
        console.log(`[AntiDuplicateTicket] Cargados ${this.locks.size} bloqueos activos`);
      }
    } catch (err) {
      console.error('[AntiDuplicateTicket] Error al cargar bloqueos:', err);
    }
  }
  
  saveToDisk() {
    try {
      const locks = [];
      
      for (const [key, expires] of this.locks.entries()) {
        if (expires > Date.now()) {
          const [userId, action] = key.split('-');
          locks.push({ userId, action, expires });
        }
      }
      
      fs.writeFileSync(this.cachePath, JSON.stringify({
        locks,
        savedAt: Date.now()
      }, null, 2));
    } catch (err) {
      console.error('[AntiDuplicateTicket] Error al guardar bloqueos:', err);
    }
  }
  
  // Verificar si se puede realizar una acción
  check(userId, action) {
    const key = `${userId}-${action}`;
    const now = Date.now();
    
    // Si no hay bloqueo o ya expiró
    if (!this.locks.has(key) || this.locks.get(key) <= now) {
      return { allowed: true };
    }
    
    // Calcular tiempo restante
    const timeLeft = Math.ceil((this.locks.get(key) - now) / 1000);
    
    return {
      allowed: false,
      timeLeft,
      message: `Esta acción está en proceso. Por favor espera ${timeLeft} segundos.`
    };
  }
  
  // Bloquear una acción por cierto tiempo
  lock(userId, action, durationSeconds = 10) {
    const key = `${userId}-${action}`;
    const expires = Date.now() + (durationSeconds * 1000);
    
    this.locks.set(key, expires);
    this.saveToDisk();
    
    return true;
  }
  
  // Desbloquear una acción explícitamente
  release(userId, action) {
    const key = `${userId}-${action}`;
    
    if (this.locks.has(key)) {
      this.locks.delete(key);
      this.saveToDisk();
      return true;
    }
    
    return false;
  }
  
  // Limpiar entradas expiradas
  cleanup() {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, expires] of this.locks.entries()) {
      if (expires <= now) {
        this.locks.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.log(`[AntiDuplicateTicket] Eliminados ${removed} bloqueos expirados`);
      this.saveToDisk();
    }
  }
}

// Exportar una instancia única
module.exports = new AntiDuplicateTicketSystem();