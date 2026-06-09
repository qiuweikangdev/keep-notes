export class EditorChangeGate {
  private userRevision = 0;
  private serializedRevision = 0;

  markUserIntent(): void {
    this.userRevision += 1;
  }

  resetAfterProgrammaticChange(): void {
    this.serializedRevision = this.userRevision;
  }

  capturePendingRevision(): number | null {
    return this.userRevision > this.serializedRevision
      ? this.userRevision
      : null;
  }

  markSerialized(revision: number): void {
    this.serializedRevision = Math.max(this.serializedRevision, revision);
  }
}
