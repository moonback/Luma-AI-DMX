export interface ReleaseMetadataInput { version: string; changelog: string; existingTags?: string[]; }
export function validateReleaseMetadata(input: ReleaseMetadataInput): string[];

export function hasRemoteTag(tag: string, readRemoteTag: (tag: string) => string): boolean;
