import { beforeEach, describe, expect, test, vi } from "vitest";
import { RetroAudio } from "../app/retro-audio";

class FakeAudioParam {
  value = 0;
  exponentialRampToValueAtTime = vi.fn();
  setValueAtTime = vi.fn();
}

class FakeAudioNode {
  connect = vi.fn(() => this);
}

class FakeOscillatorNode extends FakeAudioNode {
  frequency = new FakeAudioParam();
  start = vi.fn();
  stop = vi.fn();
  type: OscillatorType = "sine";
}

class FakeBiquadFilterNode extends FakeAudioNode {
  frequency = new FakeAudioParam();
  gain = new FakeAudioParam();
  Q = new FakeAudioParam();
  type: BiquadFilterType = "lowpass";
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeBufferSourceNode extends FakeAudioNode {
  buffer: unknown = null;
  start = vi.fn();
}

class FakeAudioContext {
  static latest: FakeAudioContext;

  bufferSources: FakeBufferSourceNode[] = [];
  currentTime = 1;
  destination = new FakeAudioNode();
  filters: FakeBiquadFilterNode[] = [];
  gains: FakeGainNode[] = [];
  oscillators: FakeOscillatorNode[] = [];
  resume = vi.fn(async () => {
    this.state = "running";
  });
  sampleRate = 48_000;
  state: AudioContextState = "running";
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });

  constructor() {
    FakeAudioContext.latest = this;
  }

  createBiquadFilter() {
    const node = new FakeBiquadFilterNode();
    this.filters.push(node);
    return node;
  }

  createBuffer(_channels: number, length: number) {
    const samples = new Float32Array(length);
    return { getChannelData: () => samples };
  }

  createBufferSource() {
    const node = new FakeBufferSourceNode();
    this.bufferSources.push(node);
    return node;
  }

  createGain() {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }

  createOscillator() {
    const node = new FakeOscillatorNode();
    this.oscillators.push(node);
    return node;
  }
}

beforeEach(() => {
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: FakeAudioContext,
    writable: true,
  });
});

describe("RetroAudio", () => {
  test("unlocks, suspends, and resumes the audio context", async () => {
    const retro = new RetroAudio();

    await expect(retro.unlock()).resolves.toBe(true);
    const context = FakeAudioContext.latest;
    expect(context.gains).toHaveLength(1);
    expect(context.gains[0].connect).toHaveBeenCalledWith(context.destination);

    retro.suspend();
    expect(context.suspend).toHaveBeenCalledTimes(1);
    expect(retro.isRunning()).toBe(false);

    await expect(retro.unlock()).resolves.toBe(true);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(retro.isRunning()).toBe(true);
  });

  test("builds and schedules every configured sound effect", async () => {
    const retro = new RetroAudio();
    await retro.unlock();
    const context = FakeAudioContext.latest;

    retro.crtWake();
    retro.postBeep();
    retro.keyTap();
    retro.enter();
    retro.error();

    expect(context.oscillators).toHaveLength(4);
    expect(context.bufferSources).toHaveLength(8);
    expect(context.filters.length).toBeGreaterThan(0);
    expect(context.gains.length).toBeGreaterThan(1);
    for (const oscillator of context.oscillators) {
      expect(oscillator.start).toHaveBeenCalledTimes(1);
      expect(oscillator.stop).toHaveBeenCalledTimes(1);
    }
    for (const source of context.bufferSources) {
      expect(source.start).toHaveBeenCalledTimes(1);
    }
  });

  test("stays inert when Web Audio is unavailable", async () => {
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    const retro = new RetroAudio();

    await expect(retro.unlock()).resolves.toBe(false);
    expect(() => {
      retro.crtWake();
      retro.postBeep();
      retro.keyTap();
      retro.enter();
      retro.error();
      retro.suspend();
    }).not.toThrow();
  });
});
