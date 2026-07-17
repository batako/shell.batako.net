type AudioContextConstructor = typeof AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: AudioContextConstructor })
      .webkitAudioContext ??
    null;
}

export class RetroAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  async unlock() {
    const Constructor = audioContextConstructor();
    if (!Constructor) return false;
    if (!this.context) {
      this.context = new Constructor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.82;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
    return this.context.state === "running";
  }

  suspend() {
    if (this.context?.state === "running") void this.context.suspend();
  }

  isRunning() {
    return this.context?.state === "running";
  }

  postBeep() {
    const context = this.ready();
    if (!context || !this.master) return;
    const now = context.currentTime;
    const start = now + 0.032;
    const duration = 0.145;

    const oscillator = context.createOscillator();
    const highpass = context.createBiquadFilter();
    const resonance = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(1018, start);
    oscillator.frequency.exponentialRampToValueAtTime(1002, start + duration);

    highpass.type = "highpass";
    highpass.frequency.value = 260;
    highpass.Q.value = 0.7;
    resonance.type = "peaking";
    resonance.frequency.value = 1480;
    resonance.Q.value = 1.5;
    resonance.gain.value = 4.2;
    lowpass.type = "lowpass";
    lowpass.frequency.value = 3600;
    lowpass.Q.value = 0.8;

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.082, start + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.064, start + 0.025);
    gain.gain.setValueAtTime(0.058, start + 0.118);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(highpass);
    highpass.connect(resonance);
    resonance.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.015);

    this.noiseClick(start, 0.006, 2900, 0.025);
    this.noiseClick(start + duration, 0.004, 2100, 0.012);
  }

  crtWake() {
    const context = this.ready();
    if (!context || !this.master) return;
    const now = context.currentTime;
    this.noiseClick(now, 0.065, 1850, 0.18);

    const degauss = context.createOscillator();
    const degaussGain = context.createGain();
    const degaussFilter = context.createBiquadFilter();
    degauss.type = "sine";
    degauss.frequency.setValueAtTime(58, now);
    degauss.frequency.exponentialRampToValueAtTime(37, now + 0.42);
    degaussFilter.type = "lowpass";
    degaussFilter.frequency.value = 145;
    degaussGain.gain.setValueAtTime(0.3, now);
    degaussGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
    degauss.connect(degaussFilter);
    degaussFilter.connect(degaussGain);
    degaussGain.connect(this.master);
    degauss.start(now);
    degauss.stop(now + 0.48);

    const flyback = context.createOscillator();
    const flybackGain = context.createGain();
    flyback.type = "sine";
    flyback.frequency.setValueAtTime(9200, now + 0.08);
    flyback.frequency.exponentialRampToValueAtTime(14700, now + 0.62);
    flybackGain.gain.setValueAtTime(0.0001, now + 0.08);
    flybackGain.gain.exponentialRampToValueAtTime(0.045, now + 0.16);
    flybackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
    flyback.connect(flybackGain);
    flybackGain.connect(this.master);
    flyback.start(now + 0.08);
    flyback.stop(now + 0.74);

  }

  keyTap() {
    const context = this.ready();
    if (!context) return;
    const now = context.currentTime;
    this.noiseClick(
      now,
      0.009,
      1750 + Math.random() * 650,
      0.34 + Math.random() * 0.05,
    );
    this.noiseClick(
      now + 0.006,
      0.013,
      620 + Math.random() * 210,
      0.22 + Math.random() * 0.04,
    );
  }

  enter() {
    const context = this.ready();
    if (!context) return;
    const now = context.currentTime;
    this.noiseClick(now, 0.028, 1250, 0.045);
    this.noiseClick(now + 0.032, 0.018, 720, 0.032);
  }

  error() {
    const context = this.ready();
    if (!context || !this.master) return;
    const now = context.currentTime;
    const duration = 0.088;
    const oscillator = context.createOscillator();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(782, now);
    oscillator.frequency.exponentialRampToValueAtTime(772, now + duration);
    highpass.type = "highpass";
    highpass.frequency.value = 230;
    highpass.Q.value = 0.7;
    lowpass.type = "lowpass";
    lowpass.frequency.value = 2900;
    lowpass.Q.value = 0.85;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.058, now + 0.002);
    gain.gain.setValueAtTime(0.052, now + 0.068);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.012);
    this.noiseClick(now, 0.004, 2450, 0.014);
  }

  private ready() {
    return this.context?.state === "running" ? this.context : null;
  }

  private noiseClick(
    start: number,
    duration: number,
    frequency: number,
    volume: number,
  ) {
    const context = this.ready();
    if (!context || !this.master) return;
    if (!this.noise) {
      const length = Math.round(context.sampleRate * 0.35);
      this.noise = context.createBuffer(1, length, context.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let index = 0; index < length; index += 1) {
        samples[index] = Math.random() * 2 - 1;
      }
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noise;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(frequency, start);
    filter.Q.setValueAtTime(2.8, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(start, Math.random() * 0.2, duration + 0.01);
  }
}
