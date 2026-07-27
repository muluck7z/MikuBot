import fs from "fs";
import path from "path";
import { logger } from "../lib/logger";

/**
 * Diretório onde os arquivos de dados (JSON) do bot são salvos
 * (economy_data.json, invite_data.json, etc).
 *
 * ─── Por que os dados "somem" a cada deploy no Railway ──────────────────────
 * O sistema de arquivos de um container no Railway não é persistente: a cada
 * novo deploy (ou restart), o Railway cria um container novo do zero, com o
 * filesystem "limpo" — qualquer arquivo escrito em tempo de execução (como
 * o economy_data.json salvo na pasta do projeto) é perdido.
 *
 * ─── Como resolver ────────────────────────────────────────────────────────
 * A solução é anexar um "Volume" (disco persistente) ao serviço no Railway,
 * que sobrevive a deploys e restarts:
 *
 *   1. No painel do Railway, abra o seu serviço.
 *   2. Vá em "Settings" → "Volumes" → "New Volume".
 *   3. Defina um "Mount Path", por exemplo: /data
 *   4. Faça o redeploy do serviço.
 *
 * Quando um volume está anexado, o Railway injeta automaticamente a variável
 * de ambiente RAILWAY_VOLUME_MOUNT_PATH com o caminho configurado. Este
 * módulo detecta essa variável e passa a salvar os dados dentro do volume —
 * então eles persistem entre atualizações. Sem volume anexado (ex: rodando
 * localmente), os dados continuam sendo salvos na pasta do projeto, como
 * antes.
 */
export const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.cwd();

let ensured = false;

/** Garante que o diretório de dados existe (idempotente, roda uma vez). */
function ensureDataDir(): void {
  if (ensured) return;
  ensured = true;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    logger.error({ err, DATA_DIR }, "Não foi possível criar o diretório de dados");
  }

  if (!process.env.RAILWAY_VOLUME_MOUNT_PATH && process.env.RAILWAY_ENVIRONMENT) {
    logger.warn(
      { DATA_DIR },
      "Nenhum Volume anexado no Railway — os dados salvos em disco serão " +
        "perdidos no próximo deploy. Anexe um Volume em Settings → Volumes " +
        "e configure RAILWAY_VOLUME_MOUNT_PATH para persistir os dados."
    );
  }
}

/** Caminho completo de um arquivo de dados dentro do diretório persistente. */
export function dataFilePath(filename: string): string {
  ensureDataDir();
  return path.join(DATA_DIR, filename);
}
