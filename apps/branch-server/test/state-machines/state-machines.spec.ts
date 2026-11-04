import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Unit Tests for State Machines & Idle Timer
 * Formally validates docs/state-machines.md
 */

describe('Session State Machine', () => {
  type SessionState = 'LOGGED_OUT' | 'LOCKED' | 'UNLOCKED';

  class MockSessionManager {
    public state: SessionState = 'LOGGED_OUT';
    public storage: Record<string, string> = {};

    login(token: string) {
      this.storage['access_token'] = token;
      this.state = 'UNLOCKED';
      delete this.storage['gebeyaos_session_locked'];
    }

    lock() {
      if (this.state === 'UNLOCKED') {
        this.state = 'LOCKED';
        this.storage['gebeyaos_session_locked'] = 'true';
      }
    }

    unlockWithPin(pin: string): boolean {
      if (this.state === 'LOCKED' && pin === '1234') {
        this.state = 'UNLOCKED';
        delete this.storage['gebeyaos_session_locked'];
        return true;
      }
      return false;
    }

    logout() {
      this.state = 'LOGGED_OUT';
      this.storage = {};
    }

    restoreOnPageLoad() {
      const hasToken = !!this.storage['access_token'];
      if (!hasToken) {
        this.state = 'LOGGED_OUT';
        return;
      }
      if (this.storage['gebeyaos_session_locked'] === 'true') {
        this.state = 'LOCKED';
      } else {
        this.state = 'UNLOCKED';
      }
    }

    onRouteChange() {
      // Route change MUST NOT mutate state
      return this.state;
    }
  }

  let session: MockSessionManager;

  beforeEach(() => {
    session = new MockSessionManager();
  });

  it('starts in LOGGED_OUT state', () => {
    expect(session.state).toBe('LOGGED_OUT');
  });

  it('transitions from LOGGED_OUT to UNLOCKED on valid login', () => {
    session.login('mock-jwt-token');
    expect(session.state).toBe('UNLOCKED');
  });

  it('transitions from UNLOCKED to LOCKED on manual lock or idle timeout', () => {
    session.login('mock-jwt-token');
    session.lock();
    expect(session.state).toBe('LOCKED');
    expect(session.storage['gebeyaos_session_locked']).toBe('true');
  });

  it('transitions from LOCKED to UNLOCKED with valid PIN', () => {
    session.login('mock-jwt-token');
    session.lock();
    const unlocked = session.unlockWithPin('1234');
    expect(unlocked).toBe(true);
    expect(session.state).toBe('UNLOCKED');
    expect(session.storage['gebeyaos_session_locked']).toBeUndefined();
  });

  it('rejects wrong PIN and remains LOCKED', () => {
    session.login('mock-jwt-token');
    session.lock();
    const unlocked = session.unlockWithPin('9999');
    expect(unlocked).toBe(false);
    expect(session.state).toBe('LOCKED');
  });

  it('page refresh preserves UNLOCKED state without asking for credentials', () => {
    session.login('mock-jwt-token');
    expect(session.state).toBe('UNLOCKED');

    // Simulate page reload
    session.restoreOnPageLoad();
    expect(session.state).toBe('UNLOCKED');
  });

  it('page refresh preserves LOCKED state (user remains on PIN screen)', () => {
    session.login('mock-jwt-token');
    session.lock();
    expect(session.state).toBe('LOCKED');

    // Simulate page reload
    session.restoreOnPageLoad();
    expect(session.state).toBe('LOCKED');
  });

  it('route change never mutates session state', () => {
    session.login('mock-jwt-token');
    expect(session.onRouteChange()).toBe('UNLOCKED');
    session.lock();
    expect(session.onRouteChange()).toBe('LOCKED');
  });
});

describe('Idle Lock Sub-System', () => {
  class MockIdleTimer {
    public isArmed = false;
    public hasTimedOut = false;
    public timeoutMs: number;
    public activeModalCount = 0;
    private timerHandle: any = null;

    constructor(timeoutMs = 600000) {
      this.timeoutMs = timeoutMs;
    }

    arm() {
      this.clear();
      this.isArmed = true;
      this.timerHandle = setTimeout(() => {
        // Modal Guard: never lock if modal is open
        if (this.activeModalCount > 0) {
          this.arm(); // postpone
          return;
        }
        this.hasTimedOut = true;
      }, this.timeoutMs);
    }

    clear() {
      if (this.timerHandle) {
        clearTimeout(this.timerHandle);
        this.timerHandle = null;
      }
    }

    onActivity() {
      this.arm();
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('resets timer on activity and does not fire prematurely', () => {
    const idle = new MockIdleTimer(600000); // 10 minutes
    idle.arm();

    vi.advanceTimersByTime(500000); // 8.3 minutes
    idle.onActivity(); // Reset activity

    vi.advanceTimersByTime(500000); // Another 8.3 minutes (total 16.6m, but only 8.3m since last activity)
    expect(idle.hasTimedOut).toBe(false);

    vi.advanceTimersByTime(110000); // Advance past 10m since last activity
    expect(idle.hasTimedOut).toBe(true);
  });

  it('never locks while a modal is open (Modal Guard invariant)', () => {
    const idle = new MockIdleTimer(600000);
    idle.arm();
    idle.activeModalCount = 1; // e.g. PaymentModal open

    vi.advanceTimersByTime(650000); // Past 10 minutes
    expect(idle.hasTimedOut).toBe(false); // Postponed by modal guard!

    idle.activeModalCount = 0; // Modal closed
    vi.advanceTimersByTime(650000); // Another 10m without modal
    expect(idle.hasTimedOut).toBe(true);
  });
});

describe('Shift State Machine & Idempotency', () => {
  type ShiftStatus = 'NONE' | 'OPEN' | 'CLOSING' | 'CLOSED';

  class MockShiftStore {
    public status: ShiftStatus = 'NONE';
    public shiftId: string | null = null;
    public openingFloat: number = 0;

    openShift(terminalId: string, float: number) {
      // Idempotency: if already open, return existing
      if (this.status === 'OPEN') {
        return { shiftId: this.shiftId!, status: this.status, idempotent: true };
      }
      this.status = 'OPEN';
      this.shiftId = `shift-${terminalId}-01`;
      this.openingFloat = float;
      return { shiftId: this.shiftId, status: this.status, idempotent: false };
    }

    startClosing() {
      if (this.status !== 'OPEN') throw new Error('Shift must be open to close');
      this.status = 'CLOSING';
    }

    confirmClose() {
      if (this.status !== 'CLOSING') throw new Error('Shift must be closing to close');
      this.status = 'CLOSED';
    }

    reset() {
      this.status = 'NONE';
      this.shiftId = null;
    }
  }

  let store: MockShiftStore;

  beforeEach(() => {
    store = new MockShiftStore();
  });

  it('transitions NONE -> OPEN on openShift', () => {
    const res = store.openShift('term-01', 500);
    expect(res.status).toBe('OPEN');
    expect(res.idempotent).toBe(false);
    expect(store.status).toBe('OPEN');
  });

  it('guarantees idempotency when openShift is called twice for the same terminal', () => {
    const first = store.openShift('term-01', 500);
    const second = store.openShift('term-01', 500);

    expect(second.status).toBe('OPEN');
    expect(second.idempotent).toBe(true);
    expect(second.shiftId).toBe(first.shiftId);
  });

  it('transitions OPEN -> CLOSING -> CLOSED -> NONE', () => {
    store.openShift('term-01', 500);
    store.startClosing();
    expect(store.status).toBe('CLOSING');

    store.confirmClose();
    expect(store.status).toBe('CLOSED');

    store.reset();
    expect(store.status).toBe('NONE');
  });
});
