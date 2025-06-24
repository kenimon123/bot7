const fs = require('fs');
const path = require('path');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');

module.exports = (client) => {
  // Directorio para transcripciones
  const transcriptDir = path.join(__dirname, '../transcripts');
  
  // Crear directorio si no existe
  if (!fs.existsSync(transcriptDir)) {
    fs.mkdirSync(transcriptDir, { recursive: true });
  }

  // Generar transcripción de un canal
  const generateTranscript = async (channel) => {
    try {
      if (!channel || !channel.isTextBased()) {
        console.error('generateTranscript: Se requiere un canal de texto válido');
        return null;
      }
      
      const messages = await fetchAllMessages(channel);
      
      if (!messages || messages.length === 0) {
        console.log(`No se encontraron mensajes para transcribir en el canal ${channel.name}`);
        return null;
      }
      
      const html = createTranscriptHtml(channel, messages);
      
      // Guardar transcripción con nombre único
      const fileName = `transcript-${channel.name}-${Date.now()}.html`;
      const filePath = path.join(transcriptDir, fileName);
      
      fs.writeFileSync(filePath, html);
      
      // Crear adjunto para Discord
      const attachment = new AttachmentBuilder(filePath, { name: fileName });
      
      return {
        file: attachment,
        path: filePath,
        name: fileName,
        messageCount: messages.length
      };
    } catch (error) {
      console.error('Error al generar transcripción:', error);
      return null;
    }
  };
  
  // Obtener todos los mensajes de un canal
  const fetchAllMessages = async (channel, limit = 500) => {
    let allMessages = [];
    let lastId;
    
    try {
      // Limitar el máximo de mensajes
      const maxMessages = Math.min(limit, 1000);
      
      while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        
        let messages;
        try {
          messages = await channel.messages.fetch(options);
        } catch (err) {
          console.error('Error al obtener mensajes:', err);
          break;
        }
        
        if (messages.size === 0) break;
        
        allMessages = [...allMessages, ...messages.values()];
        lastId = messages.last().id;
        
        if (allMessages.length >= maxMessages) break;
        if (messages.size < 100) break;
      }
      
      return allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    } catch (error) {
      console.error('Error al obtener mensajes para transcripción:', error);
      return allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    }
  };
  
  // Crear HTML para la transcripción
  const createTranscriptHtml = (channel, messages) => {
    const serverName = channel.guild.name;
    const channelName = channel.name;
    const ticketId = channelName.match(/\d+$/)?.[0] || 'desconocido';
    const messageCount = messages.length;
    const transcriptDate = new Date().toLocaleString();
    
    const styles = `
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.5; margin: 0; padding: 0; color: #23272A; background-color: #f9f9f9; }
      .container { max-width: 960px; margin: 20px auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      .header { background-color: #5865F2; color: white; padding: 20px 30px; }
      .header h1 { margin: 0; font-size: 24px; }
      .header p { margin: 10px 0 0; opacity: 0.9; }
      .statistics { background-color: #ededed; padding: 15px 30px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; }
      .statistics div { flex: 1; }
      .statistics h3 { margin: 0 0 5px 0; font-size: 14px; color: #6c757d; }
      .statistics p { margin: 0; font-weight: bold; }
      .messages { padding: 0 20px; background-color: #fff; }
      .message { padding: 15px 10px; display: flex; border-bottom: 1px solid #f0f0f0; }
      .message:last-child { border-bottom: none; }
      .avatar-container { margin-right: 20px; }
      .avatar { border-radius: 50%; width: 40px; height: 40px; }
      .message-content { flex: 1; }
      .author-name { font-weight: bold; color: #5865F2; margin-bottom: 5px; display: flex; align-items: center; }
      .bot-tag { background-color: #5865F2; color: white; border-radius: 3px; font-size: 12px; padding: 2px 6px; margin-left: 8px; }
      .system-message { background-color: #f8f9fa; border-left: 4px solid #5865F2; padding-left: 10px; }
      .content { word-wrap: break-word; }
      .timestamp { color: #99AAB5; font-size: 0.75em; margin-top: 6px; }
      .footer { text-align: center; padding: 20px; background-color: #f8f9fa; border-top: 1px solid #ddd; }
      .attachment { display: block; margin: 10px 0; padding: 10px; background-color: #f8f9fa; border-radius: 5px; }
      .attachment a { color: #5865F2; text-decoration: none; }
      .embed { border-left: 4px solid #5865F2; margin: 8px 0; padding: 8px 12px; background-color: #f6f6f7; border-radius: 0 5px 5px 0; }
      .embed .embed-title { font-weight: bold; margin-bottom: 5px; }
      .embed .embed-description { font-size: 0.95em; }
      .embed .embed-fields { display: flex; flex-wrap: wrap; margin-top: 10px; }
      .embed .embed-field { flex: 1; min-width: 45%; margin-bottom: 10px; margin-right: 10px; }
      .embed .embed-field-name { font-weight: bold; margin-bottom: 2px; }
    `;
    
    let html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ticket #${ticketId} - Transcripción</title>
        <style>${styles}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Ticket #${ticketId} - Transcripción</h1>
            <p>Canal: ${channelName} | Servidor: ${serverName}</p>
          </div>
          <div class="statistics">
            <div>
              <h3>Mensajes</h3>
              <p>${messageCount}</p>
            </div>
            <div>
              <h3>Generado</h3>
              <p>${transcriptDate}</p>
            </div>
          </div>
          <div class="messages">
    `;
    
    for (const message of messages) {
      try {
        const author = message.author;
        const isBot = author.bot;
        const timestamp = message.createdAt.toLocaleString();
        const content = message.content || '';
        const avatarURL = author.displayAvatarURL({ format: 'png', size: 128 });
        
        html += `
          <div class="message">
            <div class="avatar-container">
              <img src="${avatarURL}" alt="Avatar" class="avatar">
            </div>
            <div class="message-content">
              <div class="author-name">
                ${escapeHtml(author.tag)}
                ${isBot ? '<span class="bot-tag">BOT</span>' : ''}
              </div>
        `;
        
        if (content) {
          let formattedContent = escapeHtml(content)
            .replace(/&lt;@!?(\d+)&gt;/g, (match, userId) => {
              const user = client.users.cache.get(userId);
              return user ? `<span class="mention">@${escapeHtml(user.tag)}</span>` : match;
            })
            .replace(/&lt;#(\d+)&gt;/g, (match, channelId) => {
              const ch = client.channels.cache.get(channelId);
              return ch ? `<span class="channel-mention">#${escapeHtml(ch.name)}</span>` : match;
            })
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
          
          html += `<div class="content">${formattedContent}</div>`;
        }
        
        if (message.attachments.size > 0) {
          message.attachments.forEach(attachment => {
            html += `
              <div class="attachment">
                <a href="${attachment.url}" target="_blank" rel="noopener noreferrer">
                  ${attachment.name} (${formatFileSize(attachment.size)})
                </a>
              </div>
            `;
          });
        }
        
        if (message.embeds.length > 0) {
          message.embeds.forEach(embed => {
            html += '<div class="embed">';
            
            if (embed.title) {
              html += `<div class="embed-title">${escapeHtml(embed.title)}</div>`;
            }
            
            if (embed.description) {
              html += `<div class="embed-description">${escapeHtml(embed.description)}</div>`;
            }
            
            if (embed.fields && embed.fields.length > 0) {
              html += '<div class="embed-fields">';
              embed.fields.forEach(field => {
                html += `
                  <div class="embed-field">
                    <div class="embed-field-name">${escapeHtml(field.name)}</div>
                    <div class="embed-field-value">${escapeHtml(field.value)}</div>
                  </div>
                `;
              });
              html += '</div>';
            }
            
            html += '</div>';
          });
        }
        
        html += `
              <div class="timestamp">${timestamp}</div>
            </div>
          </div>
        `;
      } catch (err) {
        console.error('Error al procesar mensaje para transcripción:', err);
      }
    }
    
    html += `
          </div>
          <div class="footer">
            <p>Esta transcripción fue generada automáticamente por KeniBot</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    return html;
  };
  
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  
  const escapeHtml = (unsafe) => {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };
  
  return {
    generateTranscript
  };
};