import { type ButtonInteraction } from "discord.js";
import { infoContainer, errorContainer, v2EphemeralReply } from "../v2/index";
import { resetAllEconomy } from "../economyStore";
import { resetInviteTracking, reconcileGuildInvites } from "../inviteTracker";

// Único usuário autorizado a usar este comando, independente de cargos.
const AUTHORIZED_USER_ID = "1503230923980800150";

export async function handleResetButton(interaction: ButtonInteraction, parts: string[]) {
  // customId: reset:<action>:_:<ownerId>
  const [, action, , ownerId] = parts;
  if (!ownerId) return;

  if (interaction.user.id !== AUTHORIZED_USER_ID || interaction.user.id !== ownerId) {
    await interaction.reply(v2EphemeralReply([errorContainer("Você não tem permissão para usar isso.")]));
    return;
  }

  if (action === "cancelar") {
    await interaction.update(
      v2EphemeralReply([infoContainer({ title: "Reset cancelado", description: "Nada foi alterado." })]) as never
    );
    return;
  }

  if (action === "confirmar") {
    const { usersWiped } = resetAllEconomy();
    resetInviteTracking();

    // Já refaz a reconciliação pro servidor atual, pra pendingInvites voltar a valer sem precisar de outro comando.
    if (interaction.guild) {
      try {
        await reconcileGuildInvites(interaction.guild);
      } catch {
        // se falhar, o /sync-invites ainda resolve depois
      }
    }

    await interaction.update(
      v2EphemeralReply([
        infoContainer({
          title: "✅ Economia resetada",
          description: [
            `Tudo voltou pro começo — **${usersWiped}** conta(s) zeradas (fichas, dívidas, cassino, investimentos e itens).`,
            "Os invites também foram revertidos: a conversão em fichas será refeita do zero a partir de agora.",
          ].join("\n"),
        }),
      ]) as never
    );
  }
}
