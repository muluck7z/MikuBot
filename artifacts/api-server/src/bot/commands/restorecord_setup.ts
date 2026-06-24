import { SlashCommandBuilder } from "discord.js";
import { type BotCommand } from "../index";

/**
 * Este comando é um placeholder para o comando /setup do Restorecord.
 * Ao incluí-lo no deploy do MikuBot, evitamos que o MikuBot delete o comando
 * do Restorecord quando ele faz o deploy global (bulk overwrite).
 */
export const restorecordSetupCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configuração do Restorecord (Placeholder para evitar deleção)")
    .setDMPermission(false),
  async execute(interaction) {
    // Como o Restorecord intercepta este comando no lado deles, 
    // este código raramente será executado se o Restorecord estiver ativo.
    // Mas caso seja, apenas informamos.
    await interaction.reply({ 
      content: "Este comando é gerenciado pelo Restorecord. Se você está vendo esta mensagem, o Restorecord pode estar offline ou não interceptou o comando.", 
      ephemeral: true 
    });
  },
};
