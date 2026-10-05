import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { confirm, useApp } from '../../AppContext';
import { colors, radius, type } from '../../theme';
import { dateKey, formatNumber, litres, prettyDate, signedLitres, timeAgo } from '../../format';
import { Badge, Button, Card, ChoiceGrid, Empty, Field, Hero, HeroStat, InfoRow, Screen, SectionHeader, Segmented, Sheet, ui } from '../../components/ui';

const REASONS = ['Leak / burst pipe', 'Meter error', 'Overflow / spillage', 'Unrecorded delivery', 'Suspected theft', 'Evaporation', 'Other'];

/** expected = opening + received − loaded − other; variance is measured against expected. */
function calc({ openingL, receivedL, loadedL, otherOutL, actualL }) {
  const n = (v) => Number(String(v ?? '').replace(/,/g, '')) || 0;
  const expectedL = n(openingL) + n(receivedL) - n(loadedL) - n(otherOutL);
  const varianceL = n(actualL) - expectedL;
  const base = expectedL > 0 ? expectedL : n(openingL) + n(receivedL);
  const variancePct = base > 0 ? Math.round((varianceL / base) * 1000) / 10 : varianceL ? 100 : 0;
  return { expectedL, varianceL, variancePct };
}

export default function ReconcileScreen() {
  const { data, act } = useApp();
  const [date, setDate] = useState(dateKey(0));
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null); // { tank, date }

  const tanks = data?.tanks ?? [];
  const recs = data?.reconciliations ?? [];
  const limit = data?.settings?.varianceThresholdPercent ?? 10;
  const forDay = recs.filter((r) => r.date === date);
  const done = new Map(forDay.map((r) => [r.tankId, r]));
  const dayVariance = forDay.reduce((s, r) => s + r.varianceL, 0);
  const flaggedCount = recs.filter((r) => r.flagged && !r.reviewedBy).length;
  const history = filter === 'flagged' ? recs.filter((r) => r.flagged) : filter === 'review' ? recs.filter((r) => r.flagged && !r.reviewedBy) : recs;
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => dateKey(d));

  const review = async (r) => {
    if (await confirm('Sign off this variance?', `${r.tankName} · ${prettyDate(r.date)} · ${r.variancePct}%\n\n“${r.explanation}”`, 'Sign off')) {
      act((api) => api.patch(`/api/reconciliations/${r.id}`, { reviewed: true }));
    }
  };

  return (
    <Screen>
      <Hero>
        <Text style={styles.caption}>DAILY WATER RECONCILIATION</Text>
        <Text style={styles.value}>{prettyDate(date)}</Text>
        <Text style={{ color: colors.cyanSoft }}>Opening + received − loaded − other usage = expected stock. Variances above {limit}% need an explanation.</Text>
        <View style={[ui.row, { gap: 8 }]}>
          <HeroStat label="Tanks done" icon="checkmark-done" value={`${done.size}/${tanks.length}`} />
          <HeroStat label="Net variance" icon="swap-vertical" value={signedLitres(dayVariance)} />
          <HeroStat label="To review" icon="flag" value={flaggedCount} />
        </View>
      </Hero>

      <Segmented value={date} onChange={setDate} options={days.map((d) => ({ value: d, label: prettyDate(d) }))} />

      <SectionHeader title="Tanks" subtitle={`Reconcile each tank for ${prettyDate(date).toLowerCase()}`} icon="clipboard" />
      {tanks.length === 0 ? <Empty title="No tanks" text="Add tanks on the Levels tab first." /> : null}
      {tanks.map((t) => {
        const r = done.get(t.id);
        return (
          <Card key={t.id} accent={!r ? colors.surfaceHigh : r.flagged ? colors.danger : colors.mint}>
            <View style={ui.between}>
              <View style={{ flex: 1 }}>
                <Text style={type.title}>{t.name}</Text>
                <Text style={type.bodySm}>{r ? `By ${r.preparedBy} · ${timeAgo(r.createdAt)}` : 'Not reconciled yet'}</Text>
              </View>
              {r ? <VarianceBadge r={r} /> : <Badge label="Pending" color={colors.amber} bg={colors.amberSoft} />}
            </View>
            {r ? <Balance r={r} /> : null}
            <Button small title={r ? 'Edit reconciliation' : 'Reconcile'} icon={r ? 'create-outline' : 'clipboard'} variant={r ? 'ghost' : 'primary'} onPress={() => setEditing({ tank: t, date })} />
          </Card>
        );
      })}

      <SectionHeader title="Reconciliation log" subtitle="Every day, every tank" icon="time" />
      <Segmented value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'All', count: recs.length },
        { value: 'flagged', label: `Over ${limit}%`, count: recs.filter((r) => r.flagged).length },
        { value: 'review', label: 'Awaiting sign-off', count: flaggedCount },
      ]} />
      {history.length === 0 ? <Empty icon="clipboard-outline" title="Nothing here" /> : null}
      {history.map((r) => (
        <Card key={r.id} accent={r.flagged ? colors.danger : colors.mint}>
          <View style={ui.between}>
            <View style={{ flex: 1 }}>
              <Text style={type.title}>{r.tankName}</Text>
              <Text style={type.bodySm}>{prettyDate(r.date)} · {r.id} · by {r.preparedBy}</Text>
            </View>
            <VarianceBadge r={r} />
          </View>
          <Balance r={r} />
          {r.flagged ? (
            <View style={styles.explain}>
              <Text style={[type.caption, { color: colors.danger }]}>{r.reason}</Text>
              <Text style={type.body}>{r.explanation}</Text>
            </View>
          ) : null}
          {r.revisions?.length ? <InfoRow icon="git-branch">Edited {r.revisions.length}× (earlier versions kept)</InfoRow> : null}
          {r.flagged ? (r.reviewedBy
            ? <Badge status="paid" icon="shield-checkmark" label={`Signed off by ${r.reviewedBy}`} />
            : <Button small title="Supervisor sign-off" icon="shield-checkmark" variant="outline" onPress={() => review(r)} />) : null}
        </Card>
      ))}

      <ReconcileSheet job={editing} onClose={() => setEditing(null)} limit={limit} />
    </Screen>
  );
}

function VarianceBadge({ r }) {
  return r.flagged
    ? <Badge label={`${r.variancePct > 0 ? '+' : ''}${r.variancePct}%`} icon="warning" color={colors.danger} bg={colors.dangerSoft} />
    : <Badge label={`${r.variancePct > 0 ? '+' : ''}${r.variancePct}% · Balanced`} icon="checkmark-circle" color={colors.mintDeep} bg={colors.mintSoft} />;
}

function Balance({ r }) {
  const rows = [
    ['Opening stock', litres(r.openingL)],
    ['+ Water received', litres(r.receivedL)],
    ['− Loaded to tankers', litres(r.loadedL)],
    ['− Other usage', litres(r.otherOutL)],
  ];
  return (
    <View style={ui.inset}>
      {rows.map(([k, v]) => (
        <View key={k} style={ui.between}><Text style={type.bodySm}>{k}</Text><Text style={[type.bodySm, type.num, { color: colors.text }]}>{v}</Text></View>
      ))}
      <View style={[ui.between, styles.totalRow]}><Text style={type.label}>Expected closing</Text><Text style={[type.label, type.num]}>{litres(r.expectedL)}</Text></View>
      <View style={ui.between}><Text style={type.label}>Actual closing (dip)</Text><Text style={[type.label, type.num]}>{litres(r.actualL)}</Text></View>
      <View style={ui.between}>
        <Text style={type.label}>Variance</Text>
        <Text style={[type.label, type.num, { color: r.flagged ? colors.danger : colors.mintDeep }]}>{signedLitres(r.varianceL)} ({r.variancePct}%)</Text>
      </View>
    </View>
  );
}

function ReconcileSheet({ job, onClose, limit }) {
  const { api, act } = useApp();
  const [form, setForm] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [jobKey, setJobKey] = useState(null);

  const key = job ? `${job.tank.id}|${job.date}` : null;
  if (key !== jobKey) {
    setJobKey(key);
    setForm(null); setDraft(null); setError('');
  }

  // Ask the server for pre-filled figures (yesterday's closing, tanker loads, current level).
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    const [tankId, date] = key.split('|');
    api.get(`/api/reconciliations/draft?tankId=${tankId}&date=${date}`).then((d) => {
      if (!live) return;
      const e = d.existing;
      const s = (v) => (v === null || v === undefined ? '' : String(v));
      setDraft(d);
      setForm(e
        ? { openingL: s(e.openingL), receivedL: s(e.receivedL), loadedL: s(e.loadedL), otherOutL: s(e.otherOutL), actualL: s(e.actualL), reason: e.reason, explanation: e.explanation ?? '' }
        : { openingL: s(d.openingL), receivedL: '', loadedL: s(d.loadedL), otherOutL: '', actualL: s(d.actualL), reason: null, explanation: '' });
    }).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [key, api]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const result = form ? calc(form) : null;
  const flagged = result && Math.abs(result.variancePct) > limit;
  const ready = form && form.openingL !== '' && form.actualL !== '' && (!flagged || (form.reason && form.explanation.trim().length >= 10));

  const submit = async () => {
    const ok = await act((a) => a.post('/api/reconciliations', { tankId: job.tank.id, date: job.date, ...form }), flagged ? 'Reconciliation saved and flagged for supervisor sign-off' : 'Reconciliation saved');
    if (ok) onClose();
  };

  return (
    <Sheet visible={Boolean(job)} onClose={onClose} title={`Reconcile ${job?.tank.name ?? ''}`} subtitle={job ? `${prettyDate(job.date)} · ${job.date}` : ''}
      footer={form ? <Button title={flagged ? 'Save with explanation' : 'Save reconciliation'} icon="checkmark" variant={flagged ? 'danger' : 'primary'} onPress={submit} disabled={!ready} /> : null}>
      {!form ? (
        error ? <Text style={{ color: colors.danger }}>{error}</Text> : <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
      ) : (
        <>
          {draft?.existing ? <InfoRow icon="information-circle" color={colors.primary}>Already reconciled by {draft.existing.preparedBy}. Saving replaces it; the earlier version is kept in the log.</InfoRow> : null}
          <Field label="Opening stock (L)" keyboardType="numeric" value={form.openingL} onChangeText={set('openingL')} />
          <Text style={[type.bodySm, { marginTop: -10 }]}>Pre-filled from: {draft?.openingSource}</Text>
          <Field label="Water received (L)" placeholder="Borehole meter / supplier delivery notes" keyboardType="numeric" value={form.receivedL} onChangeText={set('receivedL')} />
          <Field label="Loaded to tankers (L)" keyboardType="numeric" value={form.loadedL} onChangeText={set('loadedL')} />
          {draft?.loads?.length ? (
            <Text style={[type.bodySm, { marginTop: -10 }]}>From dispatched missions: {draft.loads.map((l) => `${l.id} ${formatNumber(l.volumeL)} L`).join(' · ')}</Text>
          ) : <Text style={[type.bodySm, { marginTop: -10 }]}>No tankers were dispatched from this tank on this day.</Text>}
          <Field label="Other usage (L)" placeholder="Bottling, washing, flushing" keyboardType="numeric" value={form.otherOutL} onChangeText={set('otherOutL')} />
          <Field label="Actual closing stock, dip / meter (L)" keyboardType="numeric" value={form.actualL} onChangeText={set('actualL')} />

          <View style={[styles.result, { borderColor: flagged ? colors.danger : colors.mint, backgroundColor: flagged ? '#FFF6F5' : colors.mintSoft }]}>
            <View style={ui.between}><Text style={type.body}>Expected closing</Text><Text style={[type.title, type.num]}>{litres(result.expectedL)}</Text></View>
            <View style={ui.between}>
              <Text style={type.body}>Variance</Text>
              <Text style={[type.headline, type.num, { color: flagged ? colors.danger : colors.mintDeep }]}>{signedLitres(result.varianceL)} · {result.variancePct}%</Text>
            </View>
            <View style={[ui.row, { gap: 6 }]}>
              <Ionicons name={flagged ? 'warning' : 'checkmark-circle'} size={18} color={flagged ? colors.danger : colors.mintDeep} />
              <Text style={[type.bodySm, { flex: 1, color: flagged ? colors.danger : colors.mintDeep }]}>
                {flagged
                  ? `Abnormal: more than ${limit}% ${result.varianceL < 0 ? 'missing' : 'extra'}. An explanation is required.`
                  : `Within the ${limit}% tolerance.`}
              </Text>
            </View>
          </View>

          {flagged ? (
            <>
              <Text style={type.caption}>Likely cause</Text>
              <ChoiceGrid columns={2} value={form.reason} onChange={set('reason')} options={REASONS.map((r) => ({ value: r, label: r }))} />
              <Field label="Explanation (required)" multiline value={form.explanation} onChangeText={set('explanation')}
                placeholder="What happened, when it was noticed, and what was done about it" />
              {form.explanation.trim().length < 10 ? <Text style={[type.bodySm, { marginTop: -10 }]}>At least 10 characters.</Text> : null}
            </>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  caption: { color: colors.cyanSoft, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  value: { color: colors.onPrimary, fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 6 },
  explain: { backgroundColor: '#FFF6F5', borderRadius: radius.md, padding: 10, gap: 4, borderLeftWidth: 3, borderLeftColor: colors.danger },
  result: { borderWidth: 1.5, borderRadius: radius.lg, padding: 12, gap: 8 },
});
