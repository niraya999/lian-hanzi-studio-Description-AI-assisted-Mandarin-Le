class LhsCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.pending = [[], []];
    this.pendingFrames = 0;
    this.batchFrames = 8192;
    this.port.onmessage = (event) => {
      if (event.data?.type === 'record') this.recording = true;
      if (event.data?.type === 'pause' || event.data?.type === 'stop' || event.data?.type === 'flush') {
        this.recording = false;
        this.flush();
        if (event.data?.type === 'flush') this.port.postMessage({ type: 'flushed' });
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    for (const channel of output || []) channel.fill(0);
    if (!this.recording) return true;
    const input = inputs[0];
    if (!input?.length || !input[0]?.length) return true;
    this.pending[0].push(input[0].slice());
    this.pending[1].push((input[1] || input[0]).slice());
    this.pendingFrames += input[0].length;
    if (this.pendingFrames >= this.batchFrames) this.flush();
    return true;
  }

  flush() {
    if (!this.pendingFrames) return;
    const channels = this.pending.map((chunks) => {
      const result = new Float32Array(this.pendingFrames);
      let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      return result;
    });
    this.pending = [[], []];
    const frames = this.pendingFrames;
    this.pendingFrames = 0;
    this.port.postMessage({ type: 'pcm', channels, frames }, channels.map((channel) => channel.buffer));
  }
}

registerProcessor('lhs-audio-capture', LhsCaptureProcessor);
