/** Who on the Rex team added the contact (internal attribution only). */
export const INTERNAL_CONTACT_OWNERS = ["James", "Adam", "Neil"] as const;

export type InternalContactOwner = (typeof INTERNAL_CONTACT_OWNERS)[number];

export function isInternalContactOwner(
  value: string | null | undefined,
): value is InternalContactOwner {
  return (
    value != null &&
    INTERNAL_CONTACT_OWNERS.includes(value as InternalContactOwner)
  );
}
