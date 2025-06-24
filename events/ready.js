module.exports = async (client) => {
  try {
    console.log(`¡Bot iniciado como ${client.user.tag}!`);
    
    // Inicializar sistemas de manera más controlada
    const initializers = [
      { name: 'Sistema de tickets', fn: () => require('../modules/ticketSystem')(client).initialize() },
      { name: 'Sistema de licencias', fn: () => require('../modules/licenseSystem')(client).initialize() },
      { name: 'Sistema de recordatorios', fn: () => require('../modules/ticketReminders')(client).initialize() },
      { name: 'Sistema de auto-cierre', fn: () => require('../modules/ticketAutoclose')(client).initialize() }
    ];
    
    // Registrar comandos
    const registerCommands = async () => {
      try {
        const { REST, Routes } = require('discord.js');
        const fs = require('fs');
        const path = require('path');
        
        console.log('Inicializando registro de comandos...');
        
        // Cargar comandos y prepararlos para registro
        const commands = [];
        const commandsPath = path.join(__dirname, '../commands');
        const commandFolders = fs.readdirSync(commandsPath);
        
        for (const folder of commandFolders) {
          const folderPath = path.join(commandsPath, folder);
          if (!fs.statSync(folderPath).isDirectory()) continue;
          
          const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
          
          for (const file of commandFiles) {
            const filePath = path.join(folderPath, file);
            
            try {
              delete require.cache[require.resolve(filePath)];
              const command = require(filePath);
              
              if (!command.data || !command.execute) {
                console.warn(`⚠️ El comando en ${file} no tiene la estructura correcta.`);
                continue;
              }
              
              commands.push(command.data.toJSON());
              client.slashCommands.set(command.data.name, command);
              
              console.log(`✅ Comando cargado: /${command.data.name}`);
            } catch (cmdError) {
              console.error(`Error al cargar comando ${file}:`, cmdError);
            }
          }
        }
        
        // Registrar comandos en todos los servidores
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        
        for (const guild of client.guilds.cache.values()) {
          try {
            console.log(`Registrando comandos en: ${guild.name}`);
            
            await rest.put(
              Routes.applicationGuildCommands(client.user.id, guild.id),
              { body: commands }
            );
          } catch (err) {
            console.error(`Error al registrar comandos en ${guild.name}:`, err);
          }
        }
        
        console.log(`✅ Total: ${commands.length} comandos registrados`);
      } catch (error) {
        console.error('Error al registrar comandos:', error);
      }
    };
    
    // Inicializar todo en secuencia para prevenir conflictos
    console.log('Iniciando inicialización de sistemas...');
    
    for (const init of initializers) {
      try {
        console.log(`Inicializando: ${init.name}`);
        await init.fn();
        console.log(`✅ ${init.name} inicializado correctamente`);
      } catch (error) {
        console.error(`Error al inicializar ${init.name}:`, error);
      }
    }
    
    // Finalmente registrar comandos
    await registerCommands();
    
    // Establecer actividad
    client.user.setActivity('/ayuda', { type: 0 });
    console.log('¡Bot listo y funcionando!');
    
  } catch (error) {
    console.error('Error crítico en evento ready:', error);
  }
};