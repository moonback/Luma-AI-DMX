export interface ReleaseMetadataInput { version: string; changelog: string; existingTags?: string[]; }
export function validateReleaseMetadata(input: ReleaseMetadataInput): string[];
