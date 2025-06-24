// Módulo centralizado para manejo de errores
module.exports = (client) => {
  // Registrar error y enviarlo al canal de logs
  const logError = async (error, context = {}) => {
    console.error('Error en el bot:', error);
    
    try {
      // Intentar obtener más información del contexto
      const { guild, command, interaction, userId } = context;
      let errorInfo = '';
      
      if (guild) errorInfo += `Servidor: ${guild.name} (${guild.id})\n`;
      if (command) errorInfo += `Comando: ${command}\n`;
      if (userId) errorInfo += `Usuario: ${userId}\n`;
      
      // Buscar un canal para reportes de errores en todos los servidores
      const reportChannels = [];
      
      client.guilds.cache.forEach(g => {
        const errorChannel = g.channels.cache.find(
          c => c.name === 'errores-bot' || c.name === 'bot-errors' || c.name === 'logs'
        );
        
        if (errorChannel && errorChannel.isTextBased()) {
          reportChannels.push(errorChannel);
        }
      });
      
      // Si encontramos algún canal, reportar el error
      if (reportChannels.length > 0) {
        const errorMessage = `⚠️ **Error detectado**\n\`\`\`\n${error.stack || error}\n\`\`\`\n**Contexto:**\n${errorInfo}`;
        
        // Enviar solo al canal del servidor donde ocurrió o al primero si no está disponible
        if (guild) {
          const serverChannel = reportChannels.find(c => c.guild.id === guild.id);
          if (serverChannel) {
            await serverChannel.send(errorMessage);
            return;
          }
        }
        
        // Si no hay un canal específico para el servidor, usar el primero
        await reportChannels[0].send(errorMessage);
      }
    } catch (logError) {
      console.error('Error al registrar error:', logError);
    }
  };
  
  return {
    logError
  };
};