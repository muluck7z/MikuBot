import { type GuildMember, PermissionFlagsBits } from "discord.js";
import { IMMUNE_ROLE_ID, STAFF_ROLE_NAMES } from "./config";

export function hasStaffAccess(member: GuildMember): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  return member.roles.cache.some(
    (role) =>
      role.id === IMMUNE_ROLE_ID ||
      STAFF_ROLE_NAMES.includes(role.name.toLowerCase())
  );
}
