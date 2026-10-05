const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('meow')
		.setDescription('meow!と返信。'),
	async execute(interaction) {
		await interaction.reply('meow!');
	},
};