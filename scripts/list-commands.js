require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
const { REST, Routes } = require('discord.js');
const { TOKEN } = process.env;
const { clientId, guildId } = require('../config.json');

const rest = new REST().setToken(TOKEN);

function printCommands(scope, commands) {
    console.log(`\n[INFO] ${scope}: ${commands.length} 件`);

    if (commands.length === 0) {
        console.log('  (なし)');
        return;
    }

    for (const command of commands) {
        console.log(`  /${command.name} - ${command.description || '説明なし'} [${command.id}]`);
    }
}

(async () => {
    try {
        const globalCommands = await rest.get(
            Routes.applicationCommands(clientId),
        );
        const guildCommands = await rest.get(
            Routes.applicationGuildCommands(clientId, guildId),
        );

        printCommands('グローバルコマンド', globalCommands);
        printCommands(`ギルドコマンド: ${guildId}`, guildCommands);
    } catch (error) {
        console.error(`[ERROR] コマンド一覧の取得に失敗: ${error.message}`);
        console.error(`[ERROR] HTTPステータス: ${error.status ?? '不明'}`);
    }
})();