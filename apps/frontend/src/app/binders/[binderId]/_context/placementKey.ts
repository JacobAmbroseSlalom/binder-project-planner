// Builds the key used to look up a card by slot, and to track a slot's
// pending-assignment state, from its placement coordinates (story 11). All
// 3 coordinates are always populated together for a placed card (see the
// `PlacementCoordinates` schema), so this never needs to handle a partially
// null placement. Shared by `useCardMutations`' `assignCustomCard` and
// `useBulkCardAdd`'s `assignCards`, since both track pending slot
// assignments by this same key.
export function placementKey(placement: {
  physicalPage: number;
  row: number;
  column: number;
}): string {
  return `${placement.physicalPage}-${placement.row}-${placement.column}`;
}
