require('dotenv').config();
const { TOKEN } = process.env;
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');

const client = new Client({ intents: Object.values(GatewayIntentBits).reduce((a, b) => a | b) });

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        }
    }
}

client.once(Events.ClientReady, () => {
    client.commands.get('alarm')?.setup(client);
    client.commands.get('alert')?.setup(client);
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'このコマンドの実行中にエラーが発生しました！', flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: 'このコマンドの実行中にエラーが発生しました！', flags: MessageFlags.Ephemeral });
        }
    }
});

client.login(TOKEN);