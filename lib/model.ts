export type Kind = 'group' | 'student' | 'attempt' | 'settings';
export type RecordItem = { id: string; kind: Kind; data: Record<string, any>; version: number; updatedAt: number };
export type Operation = { id: string; opId: string; kind: Kind; data: Record<string, any>; expectedVersion: number };
export type Session = { eventId: string; password: string; title: string };
export const id = () => crypto.randomUUID();
export function rankGroups(records: RecordItem[], mode = 'hit') {
  const attempts = records.filter(r => r.kind === 'attempt' && !r.data.deleted);
  const groups = records.filter(r => r.kind === 'group' && !r.data.deleted);
  const result = groups.map(g => {
    const rows = attempts.filter(a => a.data.groupId === g.id);
    const scores = rows.map(a => a.data.score).filter(v => typeof v === 'number');
    const distances = rows.map(a => a.data.distance).filter(v => typeof v === 'number');
    return { ...g, shots: rows.length, hits: rows.filter(a => a.data.hit === true).length,
      score: scores.length ? Math.max(...scores) : null,
      distance: distances.length ? Math.min(...distances) : null, rank: 0 };
  });
  const compare = (a: typeof result[number], b: typeof result[number]) => {
    const hit = b.hits - a.hits;
    const score = (b.score ?? -Infinity) - (a.score ?? -Infinity);
    const distance = (a.distance ?? Infinity) - (b.distance ?? Infinity);
    const ordered = mode === 'score' ? [score, hit, distance] : mode === 'distance' ? [distance, hit, score] : [hit, score, distance];
    return ordered.find(v => !Number.isNaN(v) && v !== 0) || 0;
  };
  const active = result.filter(g => g.shots > 0).sort((a,b) => compare(a,b) || Number(a.data.number)-Number(b.data.number));
  active.forEach((g,i) => g.rank = i && compare(g, active[i-1]) === 0 ? active[i-1].rank : i + 1);
  return [...active, ...result.filter(g => !g.shots).sort((a,b) => Number(a.data.number)-Number(b.data.number))];
}
export const csvCell = (value: unknown) => {
  let s = value == null ? '' : String(value);
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
