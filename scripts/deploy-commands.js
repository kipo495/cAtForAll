require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
const { REST, Routes } = require('discord.js');
const { TOKEN } = process.env;
const { clientId, guildId } = require('../config.json');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const foldersPath = path.join(__dirname, '..', 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			commands.push(command.data.toJSON());
		}
	}
}

const rest = new REST().setToken(TOKEN);

(async () => {
	await rest.put(
		Routes.applicationCommands(clientId),
		{ body: [] },
	);

	await rest.put(
		Routes.applicationGuildCommands(clientId, guildId),
		{ body: commands },
	);
})();