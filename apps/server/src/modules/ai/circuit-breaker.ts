export enum CircuitState {
  CLOSED = 'CLOSED',       // Hoạt động bình thường
  OPEN = 'OPEN',           // Mở ngắt mạch: chặn gọi provider do nhiều lỗi liên tiếp
  HALF_OPEN = 'HALF_OPEN', // Thử nghiệm hồi phục
}

export interface ProviderCircuitInfo {
  providerId: string;
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureAt: Date | null;
  lastSuccessAt: Date | null;
  openUntil: Date | null;
  lastErrorMessage?: string;
}

class CircuitBreakerManager {
  private circuits = new Map<string, ProviderCircuitInfo>();
  private readonly failureThreshold: number = 3; // Sau 3 lỗi liên tiếp -> Mở mạch
  private readonly coolOffMs: number = 30000;    // 30 giây thời gian ngắt mạch

  private getOrCreateCircuit(providerId: string): ProviderCircuitInfo {
    let circuit = this.circuits.get(providerId);
    if (!circuit) {
      circuit = {
        providerId,
        state: CircuitState.CLOSED,
        consecutiveFailures: 0,
        lastFailureAt: null,
        lastSuccessAt: null,
        openUntil: null,
      };
      this.circuits.set(providerId, circuit);
    }
    return circuit;
  }

  public isAvailable(providerId: string): boolean {
    const circuit = this.getOrCreateCircuit(providerId);
    if (circuit.state === CircuitState.CLOSED) return true;

    if (circuit.state === CircuitState.OPEN) {
      if (circuit.openUntil && Date.now() >= circuit.openUntil.getTime()) {
        circuit.state = CircuitState.HALF_OPEN;
        return true;
      }
      return false;
    }

    if (circuit.state === CircuitState.HALF_OPEN) {
      return true;
    }

    return true;
  }

  public recordSuccess(providerId: string) {
    const circuit = this.getOrCreateCircuit(providerId);
    circuit.consecutiveFailures = 0;
    circuit.state = CircuitState.CLOSED;
    circuit.openUntil = null;
    circuit.lastSuccessAt = new Date();
    circuit.lastErrorMessage = undefined;
  }

  public recordFailure(providerId: string, errorMessage?: string) {
    const circuit = this.getOrCreateCircuit(providerId);
    circuit.consecutiveFailures += 1;
    circuit.lastFailureAt = new Date();
    circuit.lastErrorMessage = errorMessage;

    if (circuit.consecutiveFailures >= this.failureThreshold || circuit.state === CircuitState.HALF_OPEN) {
      circuit.state = CircuitState.OPEN;
      circuit.openUntil = new Date(Date.now() + this.coolOffMs);
    }
  }

  public getStatus(providerId: string): ProviderCircuitInfo {
    return { ...this.getOrCreateCircuit(providerId) };
  }

  public reset(providerId: string) {
    this.circuits.delete(providerId);
  }
}

export const circuitBreaker = new CircuitBreakerManager();
