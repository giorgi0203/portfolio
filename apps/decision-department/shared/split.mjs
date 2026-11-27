/** Allocate a whole number of tetri. Equal remainders go to the earlier seat. */
function portions(total, weights) {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (!weightTotal) return weights.map(() => 0);
  const result = weights.map((weight) =>
    Math.floor((total * weight) / weightTotal),
  );
  const order = weights
    .map((weight, index) => ({
      index,
      remainder: (total * weight) % weightTotal,
    }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const left = total - result.reduce((sum, amount) => sum + amount, 0);
  for (let i = 0; i < left; i++) result[order[i].index]++;
  return result;
}

/** Claims are relative portions of a receipt row. Unclaimed items and their fees stay visible. */
export function calculateSplit(items, participants, claims, feeMinor) {
  const people = participants.map(({ id }) => ({
    id,
    itemsMinor: 0,
    feeMinor: 0,
    totalMinor: 0,
  }));
  const seats = new Map(people.map((person, index) => [person.id, index]));
  const ordered = new Map();
  for (const claim of claims) {
    const seat = seats.get(claim.participantId);
    if (
      seat === undefined ||
      !Number.isSafeInteger(claim.weight) ||
      claim.weight < 1
    )
      continue;
    let weights = ordered.get(claim.itemId);
    if (!weights)
      ordered.set(claim.itemId, (weights = Array(people.length).fill(0)));
    weights[seat] = claim.weight;
  }
  let subtotalMinor = 0,
    unassignedMinor = 0;
  for (const item of items) {
    const row = item.quantity * item.unitMinor;
    subtotalMinor += row;
    const weights = ordered.get(item.id);
    if (!weights) {
      unassignedMinor += row;
      continue;
    }
    portions(row, weights).forEach((amount, seat) => {
      people[seat].itemsMinor += amount;
    });
  }
  const fees = portions(feeMinor, [
    ...people.map((person) => person.itemsMinor),
    unassignedMinor,
  ]);
  people.forEach((person, index) => {
    person.feeMinor = fees[index];
    person.totalMinor = person.itemsMinor + person.feeMinor;
  });
  unassignedMinor += subtotalMinor ? fees[people.length] : feeMinor;
  return {
    subtotalMinor,
    feeMinor,
    totalMinor: subtotalMinor + feeMinor,
    unassignedMinor,
    people,
  };
}
