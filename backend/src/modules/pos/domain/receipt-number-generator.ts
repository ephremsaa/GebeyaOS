export class ReceiptNumberGenerator {
  /**
   * Generates a globally unique, monotonically ordered, offline-safe receipt number.
   * Format: {BRANCH_CODE}-{TERMINAL_CODE}-{YYYYMMDD}-{SHIFT_NO}-{SEQ}
   * Example: BOLE01-POS01-20261021-02-00042
   */
  public static generate(
    branchCode: string,
    terminalCode: string,
    shiftNumber: number,
    sequenceNumber: number,
    date: Date = new Date(),
  ): string {
    const cleanBranch = branchCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const cleanTerminal = terminalCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;

    const shiftStr = String(shiftNumber).padStart(2, '0');
    const seqStr = String(sequenceNumber).padStart(5, '0');

    return `${cleanBranch}-${cleanTerminal}-${dateStr}-${shiftStr}-${seqStr}`;
  }
}
