import { Behavior, Type, type FunctionDeclaration } from '@google/genai';
import { act } from '../api';
import { t } from '../i18n';
import { useStore } from '../store';
import type { AiProposal } from '../../core/ai/actions';

const LOG = '[Voice:Tools]';

/* ─────────────────────────────────────────────────────────────────────────────
   SYSTEM PROMPT
   Verrouillé côté serveur dans liveConnectConstraints (src/core/app/handlers/ai.ts).
   Ce fichier sert de source de vérité documentaire : toute modification ici doit
   être répercutée dans le handler backend.
────────────────────────────────────────────────────────────────────────────── */
export const SYSTEM_PROMPT = `\
Tu es l'assistant vocal intégré d'une console d'éclairage DMX professionnelle. \
Tu t'adresses à un opérateur ou un éclairagiste. Réponds toujours en français, \
avec des phrases courtes et naturelles (1-3 phrases max). Sois direct et précis.

## Tes outils — utilise-les TOUJOURS, n'invente rien

1. **propose_lighting(request)** — Chaque fois que l'opérateur demande un effet, \
une couleur, une intensité, une ambiance, une scène, un effet ou tout changement \
d'éclairage : appelle cet outil avec la demande mot pour mot. N'attends PAS d'avoir \
parlé, cet outil est non-bloquant et tu peux parler pendant qu'il travaille.

2. **apply_proposal()** — Applique la dernière proposition. N'appelle cet outil \
QU'APRÈS un accord explicite de l'opérateur : « oui », « vas-y », « applique », \
« ok », « go ». Si l'opérateur hésite, change d'avis ou pose une question, \
n'applique rien.

3. **undo_last()** — Annule la dernière application IA. À appeler si l'opérateur \
dit « annule », « reviens en arrière », « défais ça ».

4. **get_status()** — Retourne l'état courant du moteur : blackout, BPM, effets actifs, \
cue lists en cours. Appelle-le quand l'opérateur pose une question d'état : \
« c'est quoi le BPM ? », « qu'est-ce qui tourne ? », « est-ce que le blackout est actif ? ».

5. **control_engine(action, …)** — Actions moteur directes et immédiates : \
blackout on/off, changer le BPM, lancer un GO sur une cue list, libérer la couche IA. \
Ces actions s'appliquent IMMÉDIATEMENT sans demander de confirmation (sauf releaseAll \
qui est irréversible, demande toujours confirmation avant).

## Flux standard pour l'éclairage

1. Opérateur demande un changement → appelle propose_lighting (sans attendre de parler)
2. Lis le résumé de la proposition : ce que tu vas faire + nombre d'actions + avertissements
3. Demande « Je l'applique ? »
4. Si accord explicite → appelle apply_proposal et confirme
5. Si refus / hésitation → ne fais rien, propose des alternatives si utile

## Règles importantes

- Ne génère JAMAIS de valeurs DMX, d'adresses ou de canaux toi-même.
- Si la couche IA est déjà active (aiActive: true dans le statut), mentionne-le \
  brièvement avant de proposer un changement.
- Si un blackout est actif, signale-le proactivement.
- Pour « éteins tout » / « black » / « libère » : utilise control_engine avec releaseAi \
  (pas propose_lighting).
- Pour les questions sur l'état : utilise get_status avant de répondre.
- Tu peux enchaîner les tours : si l'opérateur dit « plus chaud » après une application, \
  appelle propose_lighting avec « plus chaud » (le fil de conversation est mémorisé).`;

/* ─────────────────────────────────────────────────────────────────────────────
   DÉCLARATIONS D'OUTILS
────────────────────────────────────────────────────────────────────────────── */
const strParam = (description: string) => ({ type: Type.STRING, description });
const boolParam = (description: string) => ({ type: Type.BOOLEAN, description });
const numParam = (description: string) => ({ type: Type.NUMBER, description });

export const TOOLS = [{
  functionDeclarations: [
    // ── Éclairage ──────────────────────────────────────────────────────────
    {
      name: 'propose_lighting',
      behavior: Behavior.NON_BLOCKING,
      description: `Prépare une proposition d'actions d'éclairage à partir de la demande de l'opérateur. \
N'applique RIEN. Retourne un résumé lisible (compréhension, actions, avertissements).`,
      parameters: {
        type: Type.OBJECT,
        properties: {
          request: strParam(`La demande de l'opérateur, telle qu'il l'a dite, mot pour mot. \
Ex: "mets les lyres en rouge", "ambiance disco", "baisse l'intensité à 50%".`),
        },
        required: ['request'],
      },
    },
    {
      name: 'apply_proposal',
      description: `Applique la dernière proposition générée par propose_lighting. \
À n'appeler QU'après accord explicite de l'opérateur (« oui », « vas-y », « ok », « go »). \
Retourne la liste des actions exécutées et celles ignorées.`,
    },
    {
      name: 'undo_last',
      description: `Annule la dernière application IA et restaure l'état précédent. \
À appeler si l'opérateur dit « annule », « reviens en arrière », « défais ça ». \
Attention : ne fonctionne que si rien n'a changé manuellement depuis.`,
    },

    // ── Statut ─────────────────────────────────────────────────────────────
    {
      name: 'get_status',
      description: `Retourne l'état courant du moteur DMX : blackout, BPM (valeur et source), \
couche IA active, effets IA en cours, cue lists actives et leur état. \
À utiliser pour répondre à des questions sur l'état du spectacle.`,
    },

    // ── Contrôle direct ────────────────────────────────────────────────────
    {
      name: 'control_engine',
      description: `Effectue une action directe et immédiate sur le moteur DMX, \
sans passer par une proposition. Actions disponibles : \
blackout on/off, set_bpm, cue_go, cue_back, cue_pause, cue_resume, \
release_ai (libère uniquement la couche IA), release_all (libère TOUT — demande confirmation avant).`,
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: strParam(`Action à effectuer. Valeurs : \
"blackout_on" | "blackout_off" | "set_bpm" | \
"cue_go" | "cue_back" | "cue_pause" | "cue_resume" | \
"release_ai" | "release_all".`),
          bpm: numParam('Nouveau BPM (20-300). Requis uniquement pour action="set_bpm".'),
          cue_list_name: strParam(`Nom de la cue list cible. Requis pour cue_go, cue_back, cue_pause, cue_resume. \
Si omis et qu'une seule cue list est active, elle est utilisée automatiquement.`),
        },
        required: ['action'],
      },
    },
  ] satisfies FunctionDeclaration[],
}];

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
────────────────────────────────────────────────────────────────────────────── */
export function summarize(p: AiProposal) {
  return {
    understanding: p.understanding,
    notices: p.notices,
    actions: p.actions.map((a) => ({ summary: a.summary, status: a.status, problems: a.messages })),
    appliable: p.actions.filter((a) => a.status !== 'rejected').length,
    rejected: p.actions.filter((a) => a.status === 'rejected').length,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   TOOL RUNNER
────────────────────────────────────────────────────────────────────────────── */
export function createToolRunner(): (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>> {
  let last: AiProposal | null = null;
  let turns = 0;

  const fail = (error: string) => {
    console.error(LOG, '✖ tool fail —', error);
    return { error };
  };

  return async (name, args) => {
    console.log(LOG, `▶ run("${name}") — args:`, JSON.stringify(args));

    switch (name) {

      /* ── propose_lighting ──────────────────────────────────────────────── */
      case 'propose_lighting': {
        const text = typeof args.request === 'string' ? args.request.trim().slice(0, 2000) : '';
        if (!text) return fail('Demande vide');

        // Check if AI is already busy
        const rt = useStore.getState().runtime;
        if (rt?.ai.busy) return fail('Une demande IA est déjà en cours, patiente un instant.');

        console.log(LOG, `propose_lighting — dispatching ai.propose | turn #${turns} | prompt: "${text}"`);
        const p = await act({ type: 'ai.propose', prompt: text, continueThread: turns++ > 0 });

        if (!p) {
          console.error(LOG, 'propose_lighting — ai.propose returned null/undefined');
          return fail('Proposition impossible (voir le message affiché)');
        }

        last = p;
        const summary = summarize(p);
        console.log(LOG, `propose_lighting — success | appliable: ${summary.appliable} | rejected: ${summary.rejected} | summary:`, JSON.stringify(summary));
        return summary;
      }

      /* ── apply_proposal ────────────────────────────────────────────────── */
      case 'apply_proposal': {
        if (!last) return fail('Aucune proposition en attente — demande d\'abord un changement d\'éclairage.');
        const appliable = last.actions.filter((a) => a.status !== 'rejected');
        if (!appliable.length) return fail('Toutes les actions de la proposition ont été rejetées — reformule ta demande.');

        console.log(LOG, 'apply_proposal — dispatching ai.apply | proposalId:', last.id, '| appliable actions:', appliable.length);
        const report = await act({ type: 'ai.apply', proposalId: last.id });

        if (!report) {
          console.error(LOG, 'apply_proposal — ai.apply returned null/undefined');
          return fail('Application impossible (voir le message affiché)');
        }

        last = null;
        console.log(LOG, `apply_proposal — success | executed: ${report.executed.length} | skipped: ${report.skipped.length}`);
        if (report.created.effects.length) console.log(LOG, 'apply_proposal — created effects:', report.created.effects);

        useStore.getState().toast({
          kind: report.skipped.length ? 'warn' : 'success',
          title: t('voice.applied', { n: report.executed.length }),
          detail: report.skipped.length ? t('voice.skipped', { n: report.skipped.length }) : undefined,
        });

        return {
          executed: report.executed.map((e) => e.summary),
          skipped: report.skipped.map((s) => `${s.summary} : ${s.reason}`),
          created: {
            scenes: report.created.scenes,
            effects: report.created.effects,
            cueLists: report.created.cueLists,
          },
          verification: report.verification.mismatches.length
            ? { overriddenByManual: report.verification.overriddenByManual, mismatches: report.verification.mismatches }
            : undefined,
        };
      }

      /* ── undo_last ─────────────────────────────────────────────────────── */
      case 'undo_last': {
        console.log(LOG, 'undo_last — dispatching ai.undoApply');
        const ok = await act({ type: 'ai.undoApply' });
        if (ok) {
          last = null;
          console.log(LOG, 'undo_last — success');
          return { ok: true, message: 'Dernière application IA annulée.' };
        }
        return fail('Rien à annuler (aucune application IA récente, ou le projet a changé depuis).');
      }

      /* ── get_status ────────────────────────────────────────────────────── */
      case 'get_status': {
        console.log(LOG, 'get_status — reading runtime state');
        const state = useStore.getState();
        const rt = state.runtime;
        const project = state.project;

        if (!rt) return fail('Moteur non disponible');

        const eng = rt.engine;
        const aiEffects = eng.effects
          .filter((e) => e.owner === 'ai')
          .map((e) => ({ name: e.name, paused: e.paused }));

        const playbacks = eng.playbacks
          .filter((pb) => pb.state !== 'idle')
          .map((pb) => {
            const list = project?.project.cueLists.find((l) => l.id === pb.cueListId);
            return {
              name: list?.name ?? pb.cueListId,
              state: pb.state,
              cue: pb.cueName ?? null,
              progress: Math.round((pb.progress ?? 0) * 100),
            };
          });

        const status = {
          blackout: eng.blackout,
          master: Math.round(eng.master * 100),
          bpm: Math.round(eng.bpm),
          bpmSource: eng.bpmSource,
          aiActive: eng.aiActive,
          aiEffects,
          activePlaybacks: playbacks,
          transmitting: rt.transmitting,
          safety: rt.safety.violation ? { violation: true, reason: rt.safety.reason } : { violation: false },
        };

        console.log(LOG, 'get_status — result:', JSON.stringify(status));
        return status;
      }

      /* ── control_engine ────────────────────────────────────────────────── */
      case 'control_engine': {
        const action = typeof args.action === 'string' ? args.action : '';
        console.log(LOG, `control_engine — action: "${action}"`);

        switch (action) {
          case 'blackout_on':
            await act({ type: 'engine.blackout', on: true });
            return { ok: true, message: 'Blackout activé.' };

          case 'blackout_off':
            await act({ type: 'engine.blackout', on: false });
            return { ok: true, message: 'Blackout désactivé.' };

          case 'set_bpm': {
            const bpm = typeof args.bpm === 'number' ? Math.round(args.bpm) : NaN;
            if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) return fail('BPM invalide — doit être entre 20 et 300.');
            await act({ type: 'engine.bpm', bpm });
            return { ok: true, message: `BPM réglé à ${bpm}.` };
          }

          case 'release_ai':
            await act({ type: 'ai.release' });
            last = null;
            return { ok: true, message: 'Couche IA libérée.' };

          case 'release_all':
            await act({ type: 'engine.releaseAll' });
            last = null;
            return { ok: true, message: 'Toutes les couches libérées (programmeur, IA, effets, cues).' };

          case 'cue_go':
          case 'cue_back':
          case 'cue_pause':
          case 'cue_resume': {
            const listId = resolveCueList(args.cue_list_name);
            if (!listId) return fail('Cue list introuvable — précise son nom (ex: "Show principal").');
            const cmd = { cue_go: 'cue.go', cue_back: 'cue.back', cue_pause: 'cue.pause', cue_resume: 'cue.resume' }[action] as 'cue.go' | 'cue.back' | 'cue.pause' | 'cue.resume';
            await act({ type: cmd, listId });
            const labels = { cue_go: 'GO', cue_back: 'Back', cue_pause: 'Pause', cue_resume: 'Reprise' };
            return { ok: true, message: `${labels[action]} envoyé.` };
          }

          default:
            return fail(`Action inconnue : "${action}". Actions disponibles : blackout_on, blackout_off, set_bpm, cue_go, cue_back, cue_pause, cue_resume, release_ai, release_all.`);
        }
      }

      default:
        return fail(`Outil inconnu : "${name}"`);
    }
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS INTERNES
────────────────────────────────────────────────────────────────────────────── */

/** Résout un nom de cue list en ID. Si name est omis et qu'une seule list est active, la retourne. */
function resolveCueList(name: unknown): string | null {
  const state = useStore.getState();
  const lists = state.project?.project.cueLists ?? [];
  if (!lists.length) return null;

  if (typeof name === 'string' && name.trim()) {
    const norm = name.trim().toLowerCase();
    const found = lists.find((l) => l.name.toLowerCase().includes(norm));
    return found?.id ?? null;
  }

  // Fallback : liste active en cours, sinon cueListId sélectionné dans l'UI, sinon la première
  const playbacks = state.runtime?.engine.playbacks ?? [];
  const active = playbacks.find((pb) => pb.state !== 'idle');
  if (active) return active.cueListId;
  return state.cueListId ?? lists[0]?.id ?? null;
}
