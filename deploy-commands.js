// Este es un archivo separado que puedes ejecutar para actualizar los comandos
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const clientId = process.env.CLIENT_ID;
const token = process.env.TOKEN;

// Verificación de variables de entorno
if (!clientId) {
  console.error('ERROR: CLIENT_ID no está definido en tu archivo .env');
  console.log('Por favor, asegúrate de que tienes estas variables en tu archivo .env:');
  console.log('TOKEN=tu_token_del_bot');
  console.log('CLIENT_ID=id_de_tu_aplicacion');
  process.exit(1); // Salir con código de error
}

if (!token) {
  console.error('ERROR: TOKEN no está definido en tu archivo .env');
  console.log('Por favor, asegúrate de que tienes estas variables en tu archivo .env:');
  console.log('TOKEN=tu_token_del_bot');
  console.log('CLIENT_ID=id_de_tu_aplicacion');
  process.exit(1); // Salir con código de error
}

console.log(`Usando CLIENT_ID: ${clientId}`);
console.log(`TOKEN está definido: ${token ? 'Sí' : 'No'}`);

// Crear un cliente REST para interactuar con la API de Discord
const rest = new REST({ version: '10' }).setToken(token);

async function deployCommands() {
  try {
    const commands = [];
    const foldersPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(foldersPath);

    // Recolectar todos los comandos de cada categoría
    for (const folder of commandFolders) {
      const commandsPath = path.join(foldersPath, folder);
      const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
      
      for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if ('data' in command && 'execute' in command) {
          commands.push(command.data.toJSON());
          console.log(`Comando cargado: ${command.data.name}`);
        }
      }
    }

    console.log(`Comenzando a actualizar ${commands.length} comandos de aplicación.`);
    console.log(`URL de la API: ${Routes.applicationCommands(clientId)}`);

    // Reemplazar TODOS los comandos existentes con los nuevos
    const data = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );

    console.log(`Comandos actualizados exitosamente: ${data.length} comandos`);
  } catch (error) {
    console.error('Error al desplegar comandos:', error);
  }
}

deployCommands();