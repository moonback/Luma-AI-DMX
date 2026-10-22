import { GEMINI_KEY, UserError, VOICE_MODEL } from '../shared';
import { voicePrompt } from '../../ai/prompts';
import type { AppService } from '../AppService';

/** One-use Gemini Live token for the voice assistant, with its instructions and tools locked server-side. */
export async function voiceToken(app: AppService): Promise<{ token: string; model: string }> {
  const apiKey = app.opts.secrets.get(GEMINI_KEY);
  if (!apiKey) throw new UserError('Clé Gemini manquante : saisissez-la dans Paramètres › IA');
  const { GoogleGenAI, Modality, Behavior, Type } = await import('@google/genai');
  const now = Date.now();
  // systemInstruction and tools MUST be locked inside liveConnectConstraints so that the
  // constrained WebSocket endpoint enforces them server-side. A constrained token ignores
  // any config sent by the client — if these fields are omitted here, the model will never
  // use the declared tools (it just speaks freely without calling them).
  // The tools must match src/renderer/voice/tools.ts (TOOLS); the instructions come from Paramètres › Assistant (src/core/ai/prompts.ts).
  const token = await new GoogleGenAI({ apiKey }).authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      liveConnectConstraints: {
        model: VOICE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: voicePrompt(app.settings.assistant.name, app.settings.assistant.voicePrompt, app.settings.assistant.autoApply),
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: app.settings.assistant.voice } } },
          tools: [{
            functionDeclarations: [
              {
                name: 'propose_lighting',
                behavior: Behavior.NON_BLOCKING,
                description: `Prépare une proposition d'actions d'éclairage à partir de la demande de l'opérateur. N'applique RIEN. Retourne un résumé lisible (compréhension, actions, avertissements).`,
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    request: { type: Type.STRING, description: `La demande de l'opérateur, telle qu'il l'a dite, mot pour mot. Ex: "mets les lyres en rouge", "ambiance disco", "baisse l'intensité à 50%".` },
                  },
                  required: ['request'],
                },
              },
              {
                name: 'apply_proposal',
                description: `Applique la dernière proposition générée par propose_lighting. À n'appeler QU'après accord explicite de l'opérateur (« oui », « vas-y », « ok », « go »). Retourne la liste des actions exécutées et celles ignorées.`,
              },
              {
                name: 'undo_last',
                description: `Annule la dernière application IA et restaure l'état précédent. À appeler si l'opérateur dit « annule », « reviens en arrière », « défais ça ». Attention : ne fonctionne que si rien n'a changé manuellement depuis.`,
              },
              {
                name: 'get_status',
                description: `Retourne l'état courant du moteur DMX : blackout, BPM (valeur et source), couche IA active, effets IA en cours, cue lists actives et leur état. À utiliser pour répondre à des questions sur l'état du spectacle.`,
              },
              {
                name: 'control_engine',
                description: `Effectue une action directe et immédiate sur le moteur DMX, sans passer par une proposition. Actions disponibles : blackout on/off, set_bpm, cue_go, cue_back, cue_pause, cue_resume, release_ai (libère uniquement la couche IA), release_all (libère TOUT — demande confirmation avant).`,
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    action: { type: Type.STRING, description: `Action à effectuer. Valeurs : "blackout_on" | "blackout_off" | "set_bpm" | "cue_go" | "cue_back" | "cue_pause" | "cue_resume" | "release_ai" | "release_all".` },
                    bpm: { type: Type.NUMBER, description: 'Nouveau BPM (20-300). Requis uniquement pour action="set_bpm".' },
                    cue_list_name: { type: Type.STRING, description: `Nom de la cue list cible. Requis pour cue_go, cue_back, cue_pause, cue_resume. Si omis et qu'une seule cue list est active, elle est utilisée automatiquement.` },
                  },
                  required: ['action'],
                },
              },
            ],
          }],
        },
      },
    },
  });
  if (!token.name) throw new UserError('Jeton Gemini non délivré');
  return { token: token.name, model: VOICE_MODEL };
}
