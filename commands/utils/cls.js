const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cls')
        .setDescription('チャンネルを初期化します。'),
    async execute(interaction) {
        const channel = interaction.channel;
        const newChannel = await channel.clone();

        await channel.delete();
        await newChannel.send('チャンネルを初期化しました。');
    },
};