/** ゲストの chats 用 ID（他用途の guestId と混ざらない固定キー） */
export const GRIMOIRE_GUEST_CHAT_STORAGE_KEY = 'tsukineko_grimoire_guest_chat_id';

/** `guest_${crypto.randomUUID()}` 形式の検証 */
export function isValidGrimoireGuestChatId(id: string): boolean {
  return /^guest_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id.trim()
  );
}
