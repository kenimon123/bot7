const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const crypto = require('crypto');

module.exports = (client) => {
  // Ruta del archivo de licencias
  const licensesPath = path.join(__dirname, '../data/licenses.json');
  
  // Crear carpeta data si no existe
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Sistema básico de caché para optimizar verificaciones frecuentes
  const licenseCache = {
    cache: new Map(),
    ttl: 60 * 1000, // 1 minuto
    set: function(key, value) {
      this.cache.set(key, {
        value,
        expires: Date.now() + this.ttl
      });
    },
    get: function(key) {
      const item = this.cache.get(key);
      if (!item) return null;
      if (Date.now() > item.expires) {
        this.cache.delete(key);
        return null;
      }
      return item.value;
    },
    invalidate: function(key) {
      this.cache.delete(key);
    },
    clear: function() {
      this.cache.clear();
    }
  };
  
  // Cargar licencias con mejor validación
  const loadLicenses = () => {
    try {
      const defaultData = { licenses: {} };
      
      if (!fs.existsSync(licensesPath)) {
        fs.writeFileSync(licensesPath, JSON.stringify(defaultData, null, 2));
        return defaultData;
      }
      
      const fileContent = fs.readFileSync(licensesPath, 'utf8');
      
      // Verificar que el contenido sea un JSON válido
      try {
        const data = JSON.parse(fileContent);
        
        // Verificar estructura
        if (!data || typeof data !== 'object') {
          throw new Error('Formato inválido: no es un objeto');
        }
        
        if (!data.licenses || typeof data.licenses !== 'object') {
          console.error('Archivo de licencias corrupto, restaurando estructura');
          return defaultData;
        }
        
        return data;
      } catch (parseError) {
        console.error('Error al parsear el archivo de licencias:', parseError);
        
        // Crear copia del archivo corrupto
        const corruptedPath = `${licensesPath}.corrupted.${Date.now()}`;
        fs.copyFileSync(licensesPath, corruptedPath);
        console.error(`Se ha guardado una copia del archivo corrupto en ${corruptedPath}`);
        
        // Devolver estructura por defecto
        return defaultData;
      }
    } catch (error) {
      console.error('Error al cargar licencias:', error);
      return { licenses: {} };
    }
  };
  
  // Guardar licencias con respaldo
  const saveLicenses = (data) => {
    try {
      // Crear respaldo antes de sobrescribir
      if (fs.existsSync(licensesPath)) {
        const backupPath = `${licensesPath}.backup`;
        fs.copyFileSync(licensesPath, backupPath);
      }
      
      fs.writeFileSync(licensesPath, JSON.stringify(data, null, 2));
      
      // Limpiar caché al guardar cambios
      licenseCache.clear();
      return true;
    } catch (error) {
      console.error('Error al guardar licencias:', error);
      return false;
    }
  };

  // Crear o asegurar que existe el rol de licencias
  const ensureLicenseRole = async (guild) => {
    try {
      if (!guild) {
        console.error('ensureLicenseRole: Se requiere un objeto guild válido');
        return null;
      }
      
      // Verificar si el rol ya existe
      let licenseRole = guild.roles.cache.find(r => r.name === client.config.licenseRole);
      
      // Si no existe, crearlo
      if (!licenseRole) {
        console.log(`Creando rol de licencias "${client.config.licenseRole}" en ${guild.name}`);
        
        licenseRole = await guild.roles.create({
          name: client.config.licenseRole,
          color: '#00AAFF',  // Azul claro
          permissions: [],
          mentionable: true,
          reason: 'Rol necesario para gestionar licencias'
        });
        
        console.log(`Rol "${client.config.licenseRole}" creado con éxito.`);
      }
      
      return licenseRole;
    } catch (error) {
      console.error(`Error al crear el rol de licencias en ${guild.name}:`, error);
      return null;
    }
  };

  // Generar clave de licencia más segura
  const generateLicenseKey = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluimos caracteres confusos como I, O, 1, 0
    let key = '';
    
    // Añadir entropía adicional
    const randomBytes = crypto.randomBytes(16);
    
    // Formato: XXXX-XXXX-XXXX-XXXX
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        // Usar parte de los bytes aleatorios para mayor seguridad
        const index = Math.floor((randomBytes[i*4+j] % chars.length));
        key += chars.charAt(index);
      }
      if (i < 3) key += '-';
    }
    
    // Verificar que la clave no exista ya
    const data = loadLicenses();
    if (data.licenses[key]) {
      // Si ya existe, generar otra
      return generateLicenseKey();
    }
    
    return key;
  };
  
  // Verificar validez de una licencia con mejor retorno de información
  const verifyLicense = (licenseKey, serverId) => {
    // Verificar caché primero
    const cachedResult = licenseCache.get(`${licenseKey}-${serverId || 'any'}`);
    if (cachedResult) return cachedResult;
    
    const data = loadLicenses();
    const license = data.licenses[licenseKey];
    
    if (!license) {
      return { valid: false, reason: 'no_exists', details: 'La licencia no existe' };
    }
    
    if (!license.active) {
      return { valid: false, reason: 'revoked', details: 'La licencia ha sido revocada' };
    }
    
    // Verificar fecha de expiración
    const now = new Date();
    const expiryDate = new Date(license.expiresAt);
    
    if (expiryDate < now) {
      // La licencia ha expirado pero aún está marcada como activa
      // Podemos actualizarla automáticamente para marcarla como inactiva
      if (license.active) {
        license.active = false;
        license.revokedAt = now.toISOString();
        license.revokedReason = 'Expiración automática';
        saveLicenses(data);
      }
      return { valid: false, reason: 'expired', details: 'La licencia ha expirado', expiryDate };
    }
    
    // Si la licencia está vinculada a un servidor específico
    if (serverId && license.serverId && license.serverId !== serverId) {
      return { valid: false, reason: 'wrong_server', details: 'La licencia pertenece a otro servidor' };
    }
    
    // Calcular días restantes como información adicional
    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    
    const result = { 
      valid: true, 
      license: { 
        clientName: license.clientName,
        expiresAt: expiryDate,
        daysLeft,
        serverId: license.serverId || null 
      } 
    };
    
    // Guardar en caché
    licenseCache.set(`${licenseKey}-${serverId || 'any'}`, result);
    
    return result;
  };
  
  // Revocar una licencia con más información
  const revokeLicense = (licenseKey, revokedBy, reason = 'No especificada') => {
    const data = loadLicenses();
    
    if (!licenseKey) {
      return { success: false, reason: 'missing_key', details: 'No se ha proporcionado una clave de licencia' };
    }
    
    if (!data.licenses[licenseKey]) {
      return { success: false, reason: 'license_not_found', details: 'La licencia no existe' };
    }
    
    // Si ya está revocada
    if (!data.licenses[licenseKey].active) {
      return { success: false, reason: 'already_revoked', details: 'Esta licencia ya ha sido revocada' };
    }
    
    data.licenses[licenseKey].active = false;
    data.licenses[licenseKey].revokedAt = new Date().toISOString();
    data.licenses[licenseKey].revokedBy = revokedBy.id;
    data.licenses[licenseKey].revokedReason = reason;
    
    const success = saveLicenses(data);
    
    // Invalidar caché para esta licencia
    licenseCache.invalidate(`${licenseKey}-any`);
    if (data.licenses[licenseKey].serverId) {
      licenseCache.invalidate(`${licenseKey}-${data.licenses[licenseKey].serverId}`);
    }
    
    return { 
      success, 
      license: data.licenses[licenseKey] 
    };
  };
  
  // Renovar una licencia con validación adicional
  const renewLicense = (licenseKey, additionalDays, renewedBy) => {
    if (!licenseKey || !additionalDays || !renewedBy) {
      return { 
        success: false, 
        reason: 'invalid_params', 
        details: 'Se requieren clave de licencia, días a añadir y usuario que renueva' 
      };
    }
    
    if (additionalDays <= 0 || additionalDays > 365) {
      return { 
        success: false, 
        reason: 'invalid_duration', 
        details: 'Los días a añadir deben estar entre 1 y 365' 
      };
    }
    
    const data = loadLicenses();
    
    if (!data.licenses[licenseKey]) {
      return { success: false, reason: 'license_not_found', details: 'La licencia no existe' };
    }
    
    const license = data.licenses[licenseKey];
    
    // Calcular nueva fecha de expiración
    const currentExpiry = new Date(license.expiresAt);
    const now = new Date();
    
    // Si la licencia ya expiró, comenzar desde hoy
    const startDate = currentExpiry < now ? now : currentExpiry;
    const newExpiry = new Date(startDate);
    newExpiry.setDate(newExpiry.getDate() + additionalDays);
    
    // Actualizar licencia
    license.expiresAt = newExpiry.toISOString();
    license.active = true;
    license.renewedAt = new Date().toISOString();
    license.renewedBy = renewedBy.id;
    license.renewalDays = (license.renewalDays || 0) + additionalDays;
    
    // Si estaba revocada por expiración, limpiar esos datos
    if (license.revokedReason === 'Expirada' || license.revokedReason === 'Expiración automática') {
      delete license.revokedAt;
      delete license.revokedBy;
      delete license.revokedReason;
    }
    
    const success = saveLicenses(data);
    
    // Invalidar caché para esta licencia
    licenseCache.invalidate(`${licenseKey}-any`);
    if (license.serverId) {
      licenseCache.invalidate(`${licenseKey}-${license.serverId}`);
    }
    
    return { 
      success,
      license: license,
      newExpiryDate: newExpiry,
      daysAdded: additionalDays
    };
  };
  
  // Purgar licencias expiradas con mejor manejo de errores
  const purgeLicenses = (executor, simulation = false) => {
    if (!executor) {
      return {
        simulation: simulation,
        success: false,
        reason: 'missing_executor',
        details: 'Se requiere un usuario ejecutor'
      };
    }
    
    try {
      const data = loadLicenses();
      const now = new Date();
      const expiredLicenses = [];
      
      // Encontrar licencias expiradas
      for (const [key, license] of Object.entries(data.licenses)) {
        if (license.active && new Date(license.expiresAt) < now) {
          expiredLicenses.push({
            key,
            clientName: license.clientName,
            expiryDate: new Date(license.expiresAt),
            expiredSince: Math.ceil((now - new Date(license.expiresAt)) / (1000 * 60 * 60 * 24)) // días expirada
          });
          
          if (!simulation) {
            data.licenses[key].active = false;
            data.licenses[key].revokedAt = now.toISOString();
            data.licenses[key].revokedBy = executor.id;
            data.licenses[key].revokedReason = 'Expirada - Purga automática';
            
            // Invalidar caché
            licenseCache.invalidate(`${key}-any`);
            if (data.licenses[key].serverId) {
              licenseCache.invalidate(`${key}-${data.licenses[key].serverId}`);
            }
          }
        }
      }
      
      let saveSuccess = true;
      if (!simulation && expiredLicenses.length > 0) {
        saveSuccess = saveLicenses(data);
      }
      
      return {
        simulation: simulation,
        success: simulation ? true : saveSuccess,
        count: expiredLicenses.length,
        licenses: expiredLicenses
      };
    } catch (error) {
      console.error('Error al purgar licencias:', error);
      return {
        simulation: simulation,
        success: false,
        reason: 'internal_error',
        details: 'Error interno al procesar licencias',
        error: error.message
      };
    }
  };
  
  // Obtener estadísticas de licencias más detalladas
  const getLicenseStats = () => {
    try {
      const data = loadLicenses();
      const licenses = Object.values(data.licenses);
      const now = new Date();
      
      // Estadísticas básicas
      const stats = {
        total: licenses.length,
        active: 0,
        revoked: 0,
        expired: 0,
        expiringSoon: 0,
        clients: {},
        createdByUser: {},
        monthlyRevenue: 0, // Estimación si cada licencia representa ingresos
        oldestLicense: null,
        newestLicense: null
      };
      
      // Si no hay licencias, devolver estadísticas vacías
      if (licenses.length === 0) {
        return stats;
      }
      
      // Procesar cada licencia
      for (const license of licenses) {
        const expiryDate = new Date(license.expiresAt);
        const creationDate = new Date(license.createdAt);
        
        // Actualizar fechas más antigua/reciente
        if (!stats.oldestLicense || creationDate < new Date(stats.oldestLicense.createdAt)) {
          stats.oldestLicense = {
            clientName: license.clientName,
            createdAt: license.createdAt
          };
        }
        
        if (!stats.newestLicense || creationDate > new Date(stats.newestLicense.createdAt)) {
          stats.newestLicense = {
            clientName: license.clientName,
            createdAt: license.createdAt
          };
        }
        
        // Contar por estado
        if (license.active) {
          stats.active++;
          
          // Verificar si está expirada
          if (expiryDate < now) {
            stats.expired++;
          } 
          // Verificar si expirará pronto (7 días)
          else {
            const daysToExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
            if (daysToExpiry <= 7) {
              stats.expiringSoon++;
            }
            
            // Estimar ingresos mensuales (suponiendo costo promedio)
            // Esto es solo un ejemplo, puedes ajustar la lógica según tus necesidades
            if (daysToExpiry > 0) {
              stats.monthlyRevenue += 10; // Suponiendo $10 por licencia activa
            }
          }
          
          // Contar por cliente
          if (!stats.clients[license.clientName]) {
            stats.clients[license.clientName] = 0;
                    }
          stats.clients[license.clientName]++;
        } else {
          stats.revoked++;
        }
        
        // Contar por creador
        if (license.createdBy) {
          if (!stats.createdByUser[license.createdBy]) {
            stats.createdByUser[license.createdBy] = 0;
          }
          stats.createdByUser[license.createdBy]++;
        }
      }
      
      return stats;
    } catch (error) {
      console.error('Error al obtener estadísticas de licencias:', error);
      return {
        total: 0,
        active: 0,
        revoked: 0,
        expired: 0,
        expiringSoon: 0,
        error: 'Error al procesar estadísticas'
      };
    }
  };
  
  // Exportar licencia a formato legible con validación
  const exportLicense = (licenseKey) => {
    if (!licenseKey) {
      return null;
    }
    
    try {
      const data = loadLicenses();
      const license = data.licenses[licenseKey];
      
      if (!license) {
        return null;
      }
      
      // Calcular días restantes o días expirada
      const now = new Date();
      const expiryDate = new Date(license.expiresAt);
      const creationDate = new Date(license.createdAt);
      
      const daysLeft = expiryDate > now 
        ? Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))
        : -Math.ceil((now - expiryDate) / (1000 * 60 * 60 * 24));
      
      const totalDuration = Math.ceil((expiryDate - creationDate) / (1000 * 60 * 60 * 24));
      
      return {
        key: licenseKey,
        client: license.clientName,
        status: license.active ? 'Activa' : 'Revocada',
        createdAt: new Date(license.createdAt).toLocaleString(),
        expiresAt: new Date(license.expiresAt).toLocaleString(),
        daysLeft: daysLeft,
        duration: totalDuration,
        serverId: license.serverId || 'Cualquier servidor',
        createdBy: license.createdBy,
        revokedInfo: license.revokedAt ? {
          at: new Date(license.revokedAt).toLocaleString(),
          by: license.revokedBy,
          reason: license.revokedReason || 'No especificada'
        } : null,
        renewalInfo: license.renewedAt ? {
          at: new Date(license.renewedAt).toLocaleString(),
          by: license.renewedBy,
          daysAdded: license.renewalDays || 'Desconocido'
        } : null
      };
    } catch (error) {
      console.error('Error al exportar licencia:', error);
      return null;
    }
  };
  
  // Verificar si existe una licencia duplicada para el mismo cliente/servidor
  const findDuplicateLicense = (clientName, serverId = null) => {
    try {
      if (!clientName) return null;
      
      const data = loadLicenses();
      
      // Buscar licencias activas para el mismo cliente y servidor
      const duplicates = Object.entries(data.licenses).filter(([_, license]) => 
        license.active && 
        license.clientName === clientName && 
        (
          // Si se especificó un serverId, debe coincidir
          (serverId && license.serverId === serverId) || 
          // O si no se especificó servidor en la búsqueda ni en la licencia existente
          (!serverId && !license.serverId)
        )
      );
      
      if (duplicates.length > 0) {
        return {
          exists: true,
          licenses: duplicates.map(([key, license]) => ({
            key,
            expiresAt: new Date(license.expiresAt),
            serverId: license.serverId
          }))
        };
      }
      
      return { exists: false };
    } catch (error) {
      console.error('Error al buscar licencias duplicadas:', error);
      return { 
        exists: false, 
        error: 'Error interno al verificar duplicados'
      };
    }
  };
  
  // Verificar permisos de usuario para gestionar licencias
  const canManageLicenses = (member) => {
    if (!member) return false;
    
    // Es administrador
    if (member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)) {
      return true;
    }
    
    // Tiene rol de licencias
    const licenseRole = member.guild.roles.cache.find(
      r => r.name === client.config.licenseRole
    );
    
    return licenseRole && member.roles.cache.has(licenseRole.id);
  };
  
  return {
    initialize: () => {
      // Verificar que el archivo de licencias esté presente o crearlo si no existe
      if (!fs.existsSync(licensesPath)) {
        saveLicenses({ licenses: {} });
      }
      
      // Cargar licencias para verificar que todo está bien
      const data = loadLicenses();
      console.log(`Sistema de licencias inicializado. ${Object.keys(data.licenses).length} licencias cargadas.`);
      
      // Verificar si hay licencias expiradas pero aún activas
      const now = new Date();
      const expiredCount = Object.values(data.licenses).filter(
        license => license.active && new Date(license.expiresAt) < now
      ).length;
      
      if (expiredCount > 0) {
        console.log(`Hay ${expiredCount} licencias expiradas que siguen activas. Usa /purgar para revocarlas.`);
      }
      
      // Crear rol de licencias en todos los servidores
      client.guilds.cache.forEach(guild => {
        ensureLicenseRole(guild).then(role => {
          if (role) {
            console.log(`Rol de licencias verificado en ${guild.name}`);
          }
        }).catch(err => {
          console.error(`Error al verificar rol de licencias en ${guild.name}:`, err);
        });
      });
    },
    
    // Exportar funciones para usar desde comandos slash
    generateLicenseKey,
    verifyLicense,
    loadLicenses,
    saveLicenses,
    revokeLicense,
    renewLicense,
    purgeLicenses,
    getLicenseStats,
    exportLicense,
    ensureLicenseRole,
    findDuplicateLicense,
    canManageLicenses
  };
};