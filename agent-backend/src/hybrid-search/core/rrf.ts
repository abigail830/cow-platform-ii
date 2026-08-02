export function reciprocalRankFusion(
  rankedLists: Array<Array<{ key: string }>>,
  rrfK: number,
  topN: number,
): Array<{ key: string; score: number }> {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((item, rank) => {
      scores.set(item.key, (scores.get(item.key) ?? 0) + 1 / (rrfK + rank + 1));
    });
  }
  return [...scores.entries()]
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
