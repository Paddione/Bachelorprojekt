export type GitHubObjectKind = 'issue' | 'pull_request' | 'advisory';
export type GitHubNumberedObjectKind = Exclude<GitHubObjectKind, 'advisory'>;

export interface GitHubRepositoryCoordinate { owner: string; repository: string; }
export interface GitHubReference extends GitHubRepositoryCoordinate {
  kind: GitHubNumberedObjectKind;
  number: number;
}
export type GitHubReferenceErrorCode =
  | 'invalid_syntax' | 'invalid_number' | 'missing_default_repository'
  | 'missing_object_kind' | 'branch_token_requires_issue';
export class GitHubReferenceError extends Error {
  constructor(readonly code: GitHubReferenceErrorCode, message: string) { super(message); }
}
export interface ParseGitHubReferenceOptions {
  defaultRepository?: GitHubRepositoryCoordinate;
  qualifiedKind?: GitHubNumberedObjectKind;
}
export interface FormatGitHubReferenceOptions {
  defaultRepository?: GitHubRepositoryCoordinate;
  qualify?: boolean;
}

function numberFrom(value: string): number {
  if (!/^[0-9]+$/.test(value)) throw new GitHubReferenceError('invalid_syntax', 'GitHub reference must use a positive base-10 number');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new GitHubReferenceError('invalid_number', 'GitHub reference number must be a positive safe integer');
  return number;
}
function defaultCoordinate(options: ParseGitHubReferenceOptions): GitHubRepositoryCoordinate {
  if (!options.defaultRepository) throw new GitHubReferenceError('missing_default_repository', 'A default repository is required for this GitHub reference');
  return options.defaultRepository;
}

export function parseGitHubReference(input: string, options: ParseGitHubReferenceOptions = {}): GitHubReference {
  const value = input.trim();
  let match = /^I#([0-9]+)$/.exec(value);
  if (match) return { kind: 'issue', ...defaultCoordinate(options), number: numberFrom(match[1]) };
  match = /^I([0-9]+)$/.exec(value);
  if (match) return { kind: 'issue', ...defaultCoordinate(options), number: numberFrom(match[1]) };
  match = /^PR#([0-9]+)$/.exec(value);
  if (match) return { kind: 'pull_request', ...defaultCoordinate(options), number: numberFrom(match[1]) };
  match = /^([^/\s#]+)/.exec(value);
  const qualified = /^([^/\s#]+)\/([^/\s#]+)#([0-9]+)$/.exec(value);
  if (qualified) {
    if (!options.qualifiedKind) throw new GitHubReferenceError('missing_object_kind', 'A qualified GitHub reference requires an object kind');
    return { kind: options.qualifiedKind, owner: qualified[1], repository: qualified[2], number: numberFrom(qualified[3]) };
  }
  if (/^(I#|I|PR#)?[+\-]?[0-9]/.test(value) || /^I#[0-9]+\./.test(value)) throw new GitHubReferenceError('invalid_number', 'GitHub reference number is invalid');
  throw new GitHubReferenceError('invalid_syntax', 'GitHub reference syntax is invalid');
}

export function formatGitHubReference(reference: GitHubReference, options: FormatGitHubReferenceOptions = {}): string {
  const defaultRepository = options.defaultRepository;
  const same = defaultRepository
    && defaultRepository.owner.toLowerCase() === reference.owner.toLowerCase()
    && defaultRepository.repository.toLowerCase() === reference.repository.toLowerCase();
  if (options.qualify || !same) return `${reference.owner}/${reference.repository}#${reference.number}`;
  return reference.kind === 'issue' ? `I#${reference.number}` : `PR#${reference.number}`;
}

export function formatBranchIssueToken(reference: GitHubReference): string {
  if (reference.kind !== 'issue') throw new GitHubReferenceError('branch_token_requires_issue', 'Only Issues can be represented by a branch token');
  return `I${reference.number}`;
}
