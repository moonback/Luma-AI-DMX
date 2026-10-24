/** File dialogs and windows injected by the host (Electron main process, or stubs in tests). */
export interface Dialogs {
  openProject(): Promise<string | null>;
  saveProject(defaultName: string): Promise<string | null>;
  openProfile(): Promise<string | null>;
  /** Several profile files at once (falls back to `openProfile`). */
  openProfiles?(): Promise<string[]>;
  /** Opens the MA Fixture Share browser window (desktop app only); its downloads are imported as profiles. */
  openFixtureShare?(): void;
  saveProfiles?(defaultName: string): Promise<string | null>;
  saveDiagnostic?(defaultName: string): Promise<string | null>;
  savePatchSheet?(defaultName: string, format: 'csv' | 'pdf'): Promise<string | null>;
  savePatchPlan?(defaultName: string): Promise<string | null>;
  saveFeedback?(defaultName: string): Promise<string | null>;
  saveMvr?(defaultName: string): Promise<string | null>;
}
